import { Router } from 'express';
import { forgotPassword, login, logout, refresh, register, resendVerification, resetPassword, verifyEmail } from '../controllers/authController';
import { asyncHandler } from '../utils/asyncHandler';
import { rateLimit } from 'express-rate-limit';

const router = Router();
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false });

router.post('/register', authLimiter, asyncHandler(register));
router.post('/verify-email', authLimiter, asyncHandler(verifyEmail));
router.post('/resend-verification', authLimiter, asyncHandler(resendVerification));
router.post('/login', authLimiter, asyncHandler(login));
router.post('/refresh', authLimiter, asyncHandler(refresh));
router.post('/logout', asyncHandler(logout));
router.post('/forgot-password', authLimiter, asyncHandler(forgotPassword));
router.post('/reset-password', authLimiter, asyncHandler(resetPassword));

export default router;