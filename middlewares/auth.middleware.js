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
  
  export { isLogin };
  