class StudentController {
  // Cookie
  static set_cookie(req, res) {
    res.cookie("cookie_name", "cookie_value", {
      maxAge: 10000,
      httpOnly: true,
    });
    res.send("Cookie has been set");
  }

  static get_cookie(req, res) {
    res.send(req.cookies);
  }

  static delete_cookie(req, res) {
    res.clearCookie("cookie_name");
    res.send("Cookie has been deleted");
  }

  // Sessoion
  static set_session(req, res) {
    console.log(req.session);
    res.send("Session has been set");
    req.session.username = "John Doe";
  }

  static session_regenerate(req, res) {
    req.session.regenerate(function (err) {
      // will have a new session here
    });
    res.send("Session has been regenerated");
  }
  static get_session(req, res) {
    res.send(req.session);
    res.send(req.session.username);
  }

  static delete_session = (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).send("Failed to destroy session");
      }
      res.send("Session destroyed");
    });
  };

  static session_example = (req, res) => {
    if (req.session.count) {
      req.session.count++;
    } else {
      req.session.count = 1;
    }

    res.send(`You have visited this page ${req.session.count} times`);
  };
}

export default StudentController;
