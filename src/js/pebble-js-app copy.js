var feedly_url = "https://sandbox.feedly.com";
var client_id = "sandbox";
var client_secret = "FUFNPXDNP2J0BF7RCEUZ";
window.localStorage.setItem("oauth_token", "AQAAmP57InUiOiIxMDE3MTg2NjkwODMxMzQwNjc1NjAiLCJpIjoiZGIxN2NlMGQtZWZiMC00N2Q0LTlmZjAtMzlhYjNhZmEzYmE4IiwicCI6NiwiYSI6IkZlZWRseSBzYW5kYm94IGNsaWVudCIsInQiOjEzOTAyOTY0MzIyMTF9");
window.localStorage.removeItem("access_token");
window.localStorage.removeItem("refresh_token");

Pebble.addEventListener("ready", function(e) {
  console.log("JavaScript app ready and running!");

  // Load refresh oath2 token
  var refresh_token = window.localStorage.getItem("refresh_token");

  // Load configuration
  var configuration = window.localStorage.getItem("configuration");
  if (!configuration) {
    configuration = {
      "logged_in": false
    }
    window.localStorage.setItem("configuration", configuration);
  }
  
  injectAccessToken(notifyOfSubscriptions);

//   handleNewToken(refresh_token);
});

function makeRequestJSON(req) {
  req.setRequestHeader("Content-Type", "application/json");
}

function addAuthentication(req, access_token) {
  req.setRequestHeader("Authorization", "OAuth " + access_token);
}

function createJSONRequest(requestType, url, onload, use_auth, onerror=null) {
  return createJSONRequest(requestType, url, null, onload, use_auth, onerror);
}

function createJSONRequest(requestType, url, params, onload, use_auth, onerror=null) {
  if (params) {
    var key_value_pairs = [];
    for (var key in params) {
      var value = params[key];
      key_value_pairs.push(encodeURIComponent(key) + "=" + encodeURIComponent(value));      
    }
    url += "?" + key_value_pairs.join("&");
  }

  var req = new XMLHttpRequest();
  req.open(requestType, url, true);
  req.onload = function(e) {
    onload(JSON.parse(req.responseText));
  }
  req.onerror = function(e) {
    if (req.status == 401) {
      console.log("Access token was bad - removing it");
      window.localStorage.removeItem("access_token");
      sendAuthenticatedRequest(req);
    } else {
      console.log("Error: " + e);
      if (onerror)
        onerror(e);
    }
  }
  req.setRequestHeader("Content-Type", "application/json");
  if (use_auth) {
    sendAuthenticatedRequest(req);
  } else {
    req.send(null);
  }
}

function notifyOfSubscriptions(access_token) {
  console.log("starting subscription request...");

  var req = new XMLHttpRequest();
  req.open("GET", feedly_url + "/v3/subscriptions", true);
  req.onload = function(e) {
    console.log("Got subscriptions!! " + e);
    Pebble.showSimpleNotificationOnPebble("Subscriptions!", "Found " + e.length + " subscriptions!");
  }
  req.onerror = function(e) {
    console.log("Failed to get subscriptions...");
    handleException(notifyOfSubscriptions, exception);
  }
  makeRequestJSON(req);
  addAuthentication(req, access_token);
  req.send(null);
  
  // var requestNumber = JSONRequest.get(feedly_url + "/v3/subscriptions", 
//     function (requestNumber, value, exception) {
//       if (value) {
//         console.log("Got subscriptions!!");
//         Pebble.showSimpleNotificationOnPebble("Subscriptions!", "Found " + value.length + " subscriptions!");
//       } else {
//         console.log("Failed to get subscriptions...");
//         handleException(notifyOfSubscriptions, exception);
//       }
//   });
  console.log("CAN YOU SEE ME??"); 
}

function handleException(callback, exception) {
  console.log("EXCEPTION CAUGHT! + " + exception);
  if (exception.errorCode == 401) {
    console.log("Access token invalid: " + access_token);
    window.localStorage.removeItem("access_token");
    injectAccessToken(callback);
  } else {
    throw exception;
  } 
}

function handleNewToken(oauth_token) {
    configuration.logged_in = (oauth_token != null);
}

function encodeParameters(obj) {
  var key_value_pairs = [];
  for (var key in obj) {
    var value = obj[key];
    key_value_pairs.push(encodeURIComponent(key) + "=" + encodeURIComponent(value));      
  }
  return "?" + key_value_pairs.join("&");
}

function sendAuthenticatedRequest(request) {

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
    var req = new XMLHttpRequest();
    var params = {
      "refresh_token": refresh_token,
      "client_id": client_id,
      "client_secret": client_secret,
      "grant_type": "refresh_token"
    };
    req.open("GET", feedly_url + "/v3/auth/token" + encodeParameters(params), true);
    req.onload = function(e) {
      // Save new access token:
      window.localStorage.setItem("access_token", value.access_token);
      console.log("Got new access token from refresh token");
      // Use access token in recursive call:
      return injectAccessToken(callback);    
    }
    req.onerror = function(e) {
      if (req.status == 401) {
        // Refresh token was invalid. Delete it and try getting new one from oauth_token
        console.log("Refresh token was invalid. Will attempt getting new one...");
        window.localStorage.removeItem("refresh_token");
        return injectAccessToken(callback);
      } else {
        throw e;
      }
    }
    return req.send(null);
  }
  
  // Both access and refresh tokens are undefined. Generate new ones from oauth_token
  var oauth_token = window.localStorage.getItem("oauth_token");
  console.log("refresh token was null. OAuth token is: " + oauth_token);
  if (oauth_token) {
    // OAuth token exists - use it to generate new access and refresh tokens:
    var req = new XMLHttpRequest();
    var params = {
      "code": oauth_token,
      "client_id": client_id,
      "client_secret": client_secret,
      "redirect_uri": null, // TODO: change to localhost if this fails...
      "state": null,
      "grant_type": "authorization_code"
    }
    req.open("GET", feedly_url + "/v3/auth/token" + encodeParameters(params), true); 
    req.onload = function(e) {
      console.log("received e: " + e);
      // Save new access token:
      window.localStorage.setItem("access_token", e.access_token);
      window.localStorage.setItem("refresh_token", e.refresh_token);
      console.log("Got new refresh and access tokens from OAuth token");
      // Use access token in recursive call:
      return injectAccessToken(callback);
    }
    req.onerror = function(e) {
      if (req.status == 401) {
        // OAuth token was invalid. Delete it and mark as logged-out.
        console.log("OAuth was invalid.");
        window.localStorage.removeItem("oauth_token");
        configuration.logged_in = false;
      } else {
        throw e;
      }
    }
    return req.send(null);
  }
  
  console.log("NO LOGIN CREDENTIALS!!");
}

Pebble.addEventListener("showConfiguration", function(e) {
  console.log("showing configuration");
  Pebble.openURL('http://localhost:8080/configuration?configuration=' + encodeURIComponent(JSON.stringify(configuration)));
});


Pebble.addEventListener("webviewclosed", function(e) {
  console.log("configuration closed");
  // webview closed
  var secret_config = JSON.parse(decodeURIComponent(e.response));
  window.localStorage.setItem("configuration", secret_config.configuration);
  window.localStorage.setItem("oauth_token", secret_config.oauth_token);
  handleNewToken(secret_config.oauth_token);
  console.log("Secret config = " + JSON.stringify(secret_config));
});






// ====================

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
