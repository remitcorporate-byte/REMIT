import { Router } from 'express';
import {
  deactivateTeamMember,
  getTeam,
  inviteTeamMember,
  updateTeamMemberRole,
} from '../controllers/team.controller';
import { protect, authorizePermission } from '../middleware/auth';

const router = Router();

router.use(protect);

router.get('/', authorizePermission('team.read'), getTeam);
router.post('/invite', authorizePermission('team.manage'), inviteTeamMember);
router.put('/:id/role', authorizePermission('team.manage'), updateTeamMemberRole);
router.put('/:id/deactivate', authorizePermission('team.manage'), deactivateTeamMember);

export default router;
