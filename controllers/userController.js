
import jwt from 'jsonwebtoken';
import { 
  createUser, 
  findUserByEmail, 
  findUserByUsername, 
  updateUserImage,
  findAllUsers,
  updateUser,
  deleteUserById
} from '../models/userModel.js';

const JWT_SECRET = process.env.JWT_SECRET || 'secret123';
const JWT_EXPIRES_IN = '30d';

// @desc    Register new user
// @route   POST /api/users/register
// @access  Public (Or super admin depending on requirement)
export const register = async (req, res) => {
  try {
    const { name, mobile, username, email, password, role, column_array, menu_array, document_name_array, show_image } = req.body;

    if (!name || !username || !email || !password) {
      return res.status(400).json({ success: false, message: 'Please add all required fields: name, username, email, password' });
    }

    // Check if user exists by email or username
    const userExistsEmail = await findUserByEmail(email);
    if (userExistsEmail) {
      return res.status(400).json({ success: false, message: 'Email already exists' });
    }

    const userExistsUsername = await findUserByUsername(username);
    if (userExistsUsername) {
      return res.status(400).json({ success: false, message: 'Username already exists' });
    }

    // Create user
    const user = await createUser({
      name,
      mobile,
      username,
      email,
      password,
      role,
      column_array,
      menu_array,
      document_name_array,
      show_image  
    });

    if (user) {
      res.status(201).json({
        success: true,
        message: 'User created successfully',
        data: user
      });
    } else {
      res.status(400).json({ success: false, message: 'Invalid user data received' });
    }
  } catch (error) {
    console.error("Register Error:", error);
    res.status(500).json({ success: false, message: 'Server error during registration' });
  }
};

// @desc    Authenticate a user
// @route   POST /api/users/login
// @access  Public
export const login = async (req, res) => {
  try {
    const { userid, password } = req.body; 

    if (!userid || !password) {
      return res.status(400).json({ success: false, message: 'Please add all fields' });
    }

    // Check for user by username or email
    let user = await findUserByUsername(userid);
    if (!user) {
      user = await findUserByEmail(userid);
    }

    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    // Check if deactivated
    if (user.is_active === 0) {
      return res.status(403).json({ success: false, message: 'Account has been deactivated' });
    }

    // Compare password
    const isMatch = password === user.password;

    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    // Create token
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, {
      expiresIn: JWT_EXPIRES_IN,
    });

    // Set cookie
// Cookie - login controller
res.cookie('token', token, {
  httpOnly: true,
  secure: false,       // HTTP is fine locally
  sameSite: 'lax',    // Works over HTTP cross-port
});

    res.json({
      success: true,
      message: 'Logged in successfully',
      data: user
    });

  } catch (error) {
      console.error("Login Error:", error);
      res.status(500).json({ success: false, message: 'Server error during login' });
  }
};

// @desc    Get user data
// @route   GET /api/users/me
// @access  Private
export const getMe = async (req, res) => {
  try {
    // req.user is set via authMiddleware
    if (req.user) {
        res.status(200).json({ success: true, data: req.user });
    } else {
        res.status(404).json({ success: false, message: 'User not found' });
    }
  } catch (error) {
      console.error("GetMe Error:", error);
      res.status(500).json({ success: false, message: 'Server error fetching user profile' });
  }
};

// @desc    Logout user / clear cookie
// @route   POST /api/users/logout
// @access  Private or Public
export const logout = (req, res) => {
  res.cookie('token', '', {
    httpOnly: true,
    expires: new Date(0), // expire immediately
  });
  
  res.status(200).json({ success: true, message: 'Logged out successfully' });
};

// @desc    Upload profile image
// @route   POST /api/users/upload-image
// @access  Private
export const uploadProfileImage = async (req, res) => {
  try {
      if (!req.file) {
          return res.status(400).json({ success: false, message: "No image file provided" });
      }

      // The file path set by multer
      const imagePath = req.file.path.replace(/\\/g, '/'); // Normalize paths for DB
      
      const userId = req.user.id;
      
      // Update DB
      const updatedUser = await updateUserImage(userId, imagePath);

      res.status(200).json({
          success: true,
          message: "Profile image updated successfully",
          data: updatedUser
      });
  } catch (error) {
      console.error("Upload Image Error:", error);
      res.status(500).json({ success: false, message: "Server error during image upload" });
  }
};

// @desc    Get all users
// @route   GET /api/users
// @access  Private (Admin role generally)
export const getAllUsers = async (req, res) => {
  try {
    const users = await findAllUsers();
    

    res.status(200).json({ success: true, data: users });
  } catch (error) {
    console.error("GetAllUsers Error:", error);
    res.status(500).json({ success: false, message: 'Server error fetching all users' });
  }
};

// @desc    Update a user
// @route   PUT /api/users/:id
// @access  Private 
export const updateUserProfile = async (req, res) => {
  try {
    const userIdToUpdate = req.params.id;
    // req.body can contain fields like name, mobile, role, menu_array, etc.
    
    const updatedUser = await updateUser(userIdToUpdate, req.body);
    
    if (!updatedUser) {
        return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.status(200).json({ 
        success: true, 
        message: 'User updated successfully',
        data: updatedUser 
    });
  } catch (error) {
    console.error("UpdateUser Error:", error);
    res.status(500).json({ success: false, message: 'Server error updating user profile' });
  }
};

// @desc    Deactivate a user
// @route   PUT /api/users/deactivate/:id
// @access  Private 
export const deactivateUser = async (req, res) => {
  try {
    const userIdToUpdate = req.params.id;
    const updatedUser = await updateUser(userIdToUpdate, { is_active: 0 });
    
    if (!updatedUser) {
        return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.status(200).json({ 
        success: true, 
        message: 'User deactivated successfully',
        data: updatedUser 
    });
  } catch (error) {
    console.error("DeactivateUser Error:", error);
    res.status(500).json({ success: false, message: 'Server error deactivating user' });
  }
};

// @desc    Delete a user
// @route   DELETE /api/users/:id
// @access  Private 
export const deleteUser = async (req, res) => {
  try {
    const userIdToDelete = req.params.id;
    await deleteUserById(userIdToDelete);
    res.status(200).json({ success: true, message: 'User deleted successfully' });
  } catch (error) {
    console.error("DeleteUser Error:", error);
    res.status(500).json({ success: false, message: 'Server error deleting user' });
  }
};
