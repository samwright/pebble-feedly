
function JSONRequester(requestType, url, params, onload, onerror=null) {

  // === Constructor ===
  
  var request;
  var attempts_left = 2;
  var using_auth;
  var that = this;
  
  if (params) {
    var key_value_pairs = [];
    for (var key in params) {
      var value = params[key];
      key_value_pairs.push(encodeURIComponent(key) + "=" + encodeURIComponent(value));      
    }
    url += "?" + key_value_pairs.join("&");
  }
  
  createRequest();
  
  // ==== Private Methods ===
  
  function createRequest() {
    request = new XMLHttpRequest();
    request.open(requestType, url, true);
    request.setRequestHeader("Content-Type", "application/json");
    
    request.onload = function(e) {
      onload(JSON.parse(request.responseText));
    }
    
    request.onerror = function(e) {
      if (request.status == 401 && using_auth && attempts_left > 0) {
        attempts_left--;
        console.log("Access token was bad - removing it. " + );
        window.localStorage.removeItem("access_token");
        createRequest();
        sendAuthenticated();
      } else {
        if (onerror)
          onerror(e);
        else
          console.log("Error: " + e);
      }
    }
  }
  
  // ==== Privileged Methods ====
  
  // Send without authentication
  this.send = function() {
    using_auth = false;
    request.send(null);
  }
  
  // Send with authentication
  this.sendAuthenticated = function() {
    using_auth = true;
  
    // Check if access token exists and is valid:
    var access_token = window.localStorage.getItem("access_token");
    console.log("injectAccessToken called... access token is: " + access_token);
    if (access_token) {
      request.setRequestHeader("Authorization", "OAuth " + access_token);
      console.log("injecting access_token!");
      return request.send(null); 
    }
  
    // Access token didn't exist, so get new one from refresh token
    var refresh_token = window.localStorage.getItem("refresh_token");
    console.log("access token was null. Refresh token is: " + refresh_token);
    if (refresh_token) {
      console.log("using refresh token to get new access token");

      // refresh token exists - try to generate new access token from it
      new JSONRequester("GET", feedly_url + "/v3/auth/token", 
        {
          "refresh_token": refresh_token,
          "client_id": client_id,
          "client_secret": client_secret,
          "grant_type": "refresh_token"
        }, 
        function(e) { // onload
          // Save new access token:
          window.localStorage.setItem("access_token", value.access_token);
          console.log("Got new access token from refresh token");
          // Use access token in recursive call:
          return that.sendAuthenticated();
        },
        function(e) { // onerror
          // Refresh token was invalid. Delete it and try getting new one from oauth_token
          console.log("Refresh token was invalid. Will attempt getting new one...");
          window.localStorage.removeItem("refresh_token");
          return that.sendAuthenticated();
        }
      ).send();
      
      return;
    }
  
    // Both access and refresh tokens are undefined. Generate new ones from oauth_token
    var oauth_token = window.localStorage.getItem("oauth_token");
    console.log("refresh token was null. OAuth token is: " + oauth_token);
    if (oauth_token) {
      // OAuth token exists - use it to generate new access and refresh tokens:
      
      new JSONRequester("GET", feedly_url + "/v3/auth/token", 
        {
          "code": oauth_token,
          "client_id": client_id,
          "client_secret": client_secret,
          "redirect_uri": null, // TODO: change to localhost if this fails...
          "state": null,
          "grant_type": "authorization_code"
        },
        function(e) { // onload
          console.log("received e: " + e);
          // Save new access token:
          window.localStorage.setItem("access_token", e.access_token);
          window.localStorage.setItem("refresh_token", e.refresh_token);
          console.log("Got new refresh and access tokens from OAuth token");
          // Use access token in recursive call:
          return that.sendAuthenticated();
        },
        function(e) { // onerror
          console.log("OAuth was invalid.");
          window.localStorage.removeItem("oauth_token");
          configuration.logged_in = false;
          that.onerror(e);
        }
      ).send();
      
      return;
    }
    
    console.log("NO LOGIN CREDENTIALS!!");
  }
}