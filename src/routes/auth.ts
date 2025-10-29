import express from "express";
import { signup, signin, refreshTokenHandler, logout } from "../controllers/authController";
const router = express.Router();

router.post("/signup", signup);
router.post("/signin", signin);
router.post("/refresh", refreshTokenHandler);
router.post("/logout", logout);

export default router;
