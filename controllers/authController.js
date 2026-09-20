import User from "../models/User.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

const getRoleForEmail = (email, currentRole = "user") => {
  const adminEmail = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  const normalizedEmail = (email || "").trim().toLowerCase();
  return adminEmail && normalizedEmail === adminEmail ? "admin" : currentRole || "user";
};

const issueToken = async (user, res, message = "Login successful") => {
  const effectiveRole = getRoleForEmail(user.email, user.role);
  if (user.role !== effectiveRole) {
    user.role = effectiveRole;
    await user.save();
  }

  const token = jwt.sign(
    { userId: user._id.toString(), role: effectiveRole, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );

  res.cookie("token", token, cookieOptions).status(200).json({
    message,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      image: user.image,
      isPremium: user.isPremium,
    },
  });
};

export const registerUser = async (req, res) => {
  try {
    const { name, email, image, password } = req.body;
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z]).{6,}$/;
    if (!passwordRegex.test(password || "")) {
      return res.status(400).json({ message: "Password must be at least 6 characters, with one uppercase and one lowercase letter." });
    }
    const existingUser = await User.findOne({ email });
    if (existingUser) return res.status(400).json({ message: "User already exists" });
    const hashedPassword = await bcrypt.hash(password, 10);
    await User.create({ name, email, image, password: hashedPassword, role: "user", isBlocked: false, isPremium: false });
    res.status(201).json({ message: "Registration successful" });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

export const loginUser = async (req, res) => {
  try {
    const email = (req.body.email || "").trim().toLowerCase();
    const { password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    const user = await User.findOne({ email });

    if (user?.isBlocked) {
      return res.status(403).json({ message: "Account is blocked by Admin" });
    }

    // First support accounts created by this Node/MongoDB app.
    if (user?.password) {
      const isMatch = await bcrypt.compare(password, user.password);
      if (isMatch) {
        return await issueToken(user, res);
      }
    }

    // Backward compatibility for older accounts that were created with
    // Firebase Email/Password authentication before the JWT/Mongo login was added.
    if (process.env.FIREBASE_API_KEY) {
      try {
        const firebaseResponse = await fetch(
          `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(process.env.FIREBASE_API_KEY)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password, returnSecureToken: true }),
          }
        );

        if (firebaseResponse.ok) {
          const firebaseUser = await firebaseResponse.json();
          const firebaseEmail = (firebaseUser.email || email).trim().toLowerCase();

          let syncedUser = await User.findOne({ email: firebaseEmail });
          if (!syncedUser) {
            syncedUser = await User.create({
              name: firebaseUser.displayName || firebaseEmail.split("@")[0],
              email: firebaseEmail,
              image: firebaseUser.photoUrl || "",
              password: null,
              role: getRoleForEmail(firebaseEmail, "user"),
              isBlocked: false,
              isPremium: false,
            });
          } else if (syncedUser.role !== getRoleForEmail(syncedUser.email, syncedUser.role)) {
            syncedUser.role = getRoleForEmail(syncedUser.email, syncedUser.role);
            await syncedUser.save();
          }

          if (syncedUser.isBlocked) {
            return res.status(403).json({ message: "Account is blocked by Admin" });
          }

          return await issueToken(syncedUser, res, "Login successful");
        }
      } catch (firebaseError) {
        console.error("Firebase password fallback error:", firebaseError.message);
      }
    }

    if (!user) return res.status(401).json({ message: "Invalid email or password" });
    if (!user.password) {
      return res.status(401).json({ message: "This account does not have an app password. Use Google login or the original Firebase email/password account." });
    }
    return res.status(401).json({ message: "Invalid email or password" });
  } catch (error) {
    console.error("Login Error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

export const googleLogin = async (req, res) => {
  try {
    const { credential } = req.body;
    if (!credential) return res.status(400).json({ message: "Google credential is required" });
    if (!process.env.GOOGLE_CLIENT_ID) return res.status(500).json({ message: "GOOGLE_CLIENT_ID is not configured on the server" });

    const googleResponse = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
    if (!googleResponse.ok) return res.status(401).json({ message: "Invalid Google credential" });
    const googleUser = await googleResponse.json();

    if (googleUser.aud !== process.env.GOOGLE_CLIENT_ID) return res.status(401).json({ message: "Google client ID mismatch" });
    if (googleUser.email_verified !== "true") return res.status(401).json({ message: "Google email is not verified" });

    const { name, email: googleEmail, picture } = googleUser;
    const email = (googleEmail || "").trim().toLowerCase();
    let user = await User.findOne({ email });
    if (!user) {
      user = await User.create({ name: name || email.split("@")[0], email, image: picture || "", password: null, role: "user", isBlocked: false, isPremium: false });
    }
    if (user.isBlocked) return res.status(403).json({ message: "Account is blocked by Admin" });
    await issueToken(user, res, "Google Login successful");
  } catch (error) {
    console.error("Google Login Error:", error);
    res.status(500).json({ message: "Google login failed", error: error.message });
  }
};

export const getCurrentUser = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select("-password");
    if (!user || user.isBlocked) return res.status(401).json({ message: "Unauthorized" });
    res.status(200).json({ user });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

export const logoutUser = async (req, res) => {
  res.clearCookie("token", cookieOptions).status(200).json({ message: "Logged out successfully" });
};
