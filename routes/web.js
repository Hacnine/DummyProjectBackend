import express from 'express';
import { homeController } from '../controllers/homeController.js';
import { aboutController } from '../controllers/aboutController.js';

import StudentController
 from '../controllers/stuController.js';
const router = express.Router();

// Cookie
router.get('/setcookie', StudentController.set_cookie);
router.get('/getcookie', StudentController.get_cookie);
router.get('/deletecookie', StudentController.delete_cookie);

// Session
router.get('/setsession', StudentController.set_session);router.get('/sessionregenerate', StudentController.session_regenerate);
router.get('/getsession', StudentController.get_session);
router.get('/deletesession', StudentController.delete_session);
router.get('/sessionexample', StudentController.session_example);

router.get('/', homeController);
router.get('/about', aboutController);
router.get('/about/12', aboutController);


export default router;