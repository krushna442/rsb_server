// routes/skillMatrixRoutes.js
import express from 'express';
import { protectRoute } from '../middlewares/authMiddleware.js';
import { uploadSkillPhoto } from '../middlewares/uploadFiles.js';
import {
  listMachines, addMachine, editMachine, deleteMachine,
  addPerson, editPerson, deletePerson
} from '../controllers/skillMatrixController.js';

const router = express.Router();

const adminOnly = (req, res, next) => {
  if (!['admin', 'super admin'].includes(req.user?.role)) {
    return res.status(403).json({ success: false, message: 'Admin access required' });
  }
  next();
};

// Machines
router.get('/',                        protectRoute, listMachines);
router.post('/',                       protectRoute, adminOnly, addMachine);
router.put('/:id',                     protectRoute, adminOnly, editMachine);
router.delete('/:id',                  protectRoute, adminOnly, deleteMachine);

// Persons (nested under machines logically, but simple flat routes)
router.post('/persons',                protectRoute, adminOnly, uploadSkillPhoto.single('photo'), addPerson);
router.put('/persons/:id',             protectRoute, adminOnly, uploadSkillPhoto.single('photo'), editPerson);
router.delete('/persons/:id',          protectRoute, adminOnly, deletePerson);

export default router;
