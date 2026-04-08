import jwt from 'jsonwebtoken';
import { findUserById } from '../models/userModel.js';

export const protectRoute = async (req, res, next) => {
  try {
    let token = req.cookies.token;

    if (!token) {
      return res.status(401).json({ success: false, message: 'Not authorized, no token' });
    }

    try {
      // Decode token
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret123');
      
      // Fetch user from db without password
      const user = await findUserById(decoded.userId);

      if (!user) {
         return res.status(401).json({ success: false, message: 'User not found' });
      }
      
      if (user.is_active === 0) {
          return res.status(403).json({ success: false, message: 'User is deactivated' });
      }

      // Attach user object to request
      req.user = user;
      next();
    } catch (error) {
      console.error(error);
      return res.status(401).json({ success: false, message: 'Not authorized, token failed' });
    }
  } catch (error) {
    console.error("Auth Middleware Error:", error);
    res.status(500).json({ success: false, message: 'Server error in auth verification' });
  }
};
