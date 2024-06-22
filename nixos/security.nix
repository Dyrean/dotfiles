{ ... }:

{
  # Whether users of the wheel group must provide a password to run commands as super user via sudo.
  security.sudo.wheelNeedsPassword = false;

  security.sudo.extraRules = [
    # Allow execution of any command by all users in group sudo,
    # requiring a password.
    { users = [ "dyrean" ]; groups = [ "sudo" ]; commands = [{ command = "ALL"; options= [ "NOPASSWD" ]; }]; }
  ];
}
