import { Router } from 'express';
import { register, login, refresh, logout, logoutAll, listSessions, revokeSession, forgotPassword, resetPassword, changePassword, getMe } from '../controllers/auth.controller';
import { protect } from '../middleware/auth';
import { authLimiter } from '../middleware/rateLimit';

const router = Router();

router.post('/register', authLimiter, register);
router.post('/login', authLimiter, login);
router.post('/refresh', authLimiter, refresh);
router.post('/password/forgot', authLimiter, forgotPassword);
router.post('/password/reset', authLimiter, resetPassword);
router.get('/me', protect, getMe);
router.post('/logout', protect, logout);
router.post('/logout-all', protect, logoutAll);
router.get('/sessions', protect, listSessions);
router.delete('/sessions/:id', protect, revokeSession);
router.post('/password/change', protect, changePassword);

export default router;
