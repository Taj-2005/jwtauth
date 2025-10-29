import express from "express";
import { signup, signin, refreshTokenHandler, signout } from "../controllers/authController";
const router = express.Router();

router.post("/signup", signup);
router.post("/signin", signin);
router.post("/refresh", refreshTokenHandler);
router.post("/signout", signout);

export default router;
