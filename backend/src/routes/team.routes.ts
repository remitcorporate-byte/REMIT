import { Router } from 'express';
import {
  deactivateTeamMember,
  getTeam,
  inviteTeamMember,
  updateTeamMemberRole,
} from '../controllers/team.controller';
import { protect } from '../middleware/auth';

const router = Router();

router.use(protect);

router.get('/', getTeam);
router.post('/invite', inviteTeamMember);
router.put('/:id/role', updateTeamMemberRole);
router.put('/:id/deactivate', deactivateTeamMember);

export default router;
