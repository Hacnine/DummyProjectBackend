const isLogin = async (req, res, next) => {
    try {
      if (req.session && req.session.user) {
        next(); // Proceed to the next middleware or route handler
      } else {
        res.status(401).json({ message: 'Unauthorized: Please log in.' });
      }
    } catch (error) {
      res.status(500).json({ message: 'Internal server error.' });
    }
  };
  

  const isLogout = (req, res, next) => {
    try {
      if (!req.session.user) {
        // User is not logged in, proceed to the next middleware or route handler
        next();
      } else {
        // User is logged in, redirect to a protected route or send an error response
        res.status(403).json({ message: "You are already logged in." });
      }
    } catch (error) {
      console.error(error.message);
      res.status(500).json({ message: "Internal server error" });
    }
  };

  
  export { isLogin, isLogout};
  