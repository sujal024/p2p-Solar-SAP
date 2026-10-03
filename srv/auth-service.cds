@requires: 'authenticated-user'
service AuthService @(path: '/auth') {
  type UserSession {
    userId            : String;
    userName          : String;
    email             : String;
    authMode          : String;
    isLocalSimulation : Boolean;
    canSwitchRole     : Boolean;
    currentRole       : String;
    capRoles          : String;
    uiRoles           : String;
  }

  function me() returns UserSession;
}
