var feedly_enc_url = "https://sandbox.feedly.com";
var feedly_url = "http://sandbox.feedly.com";
var config_url = "http://pebble-feedly.appspot.com/configuration";
var client_id = "sandbox";
var client_secret = "FUFNPXDNP2J0BF7RCEUZ";
var ms_in_day = 60*60*24*1000;
var streams;
var configuration;
var days_with_saved_entries;
var entries_count;
var entries_size;

/**

TODO: 
 - deleting of old entries doesn't update statistics
 - compression doesn't seem to do anything (200 entries is 15 seconds)
 - split requests for >1000 entries into multiple requests
**/

Pebble.addEventListener("ready", function(e) {
  console.log("JavaScript app ready and running!");

  // Load data
  loadGlobalData();
  
//   Pebble.sendAppMessage({
//     "city":"Loc Unavailable",
//     "temperature":"N/A"
//   }, function() {
//     console.log("acknowledged");
//   }, function() {
//     console.log("NOT acknowledged");
//   });
  
//   new JSONRequester("GET", feedly_enc_url + "/v3/subscriptions", {},
//     function(response) { // onload
//       console.log("Got subscriptions!! " + JSON.stringify(response));
//       Pebble.showSimpleNotificationOnPebble("Subscriptions!", "Found " + response.length + " subscriptions!");
//       deleteOldEntries(-1);
//       entries_count = 0;
//       entries_size = 0;
//       days_with_saved_entries = {}
      
//     }
//   ).sendAuthenticated();
});


Pebble.addEventListener("showConfiguration", function(e) {
//   var url = config_url + "?configuration=" + encodeURIComponent(JSON.stringify(configuration));
  console.log("showing configuration");
  Pebble.openURL(config_url);
});


Pebble.addEventListener("webviewclosed", function(e) {
  
  // webview closed
  var secret_config = JSON.parse(decodeURIComponent(e.response));
  console.log("configuration closed, response = " + e.response);
  
  window.localStorage.setItem("configuration", secret_config.configuration);
  if (secret_config.oauth_token) {
    window.localStorage.setItem("oauth_token", secret_config.oauth_token);
    window.localStorage.removeItem("access_token");
    window.localStorage.removeItem("refresh_token");
    window.localStorage.removeItem("user_id");
    
    // Recreate the DB
    recreateDB();
    
  }
});

var messageCallbacks = {
  0 : synchroniseData
}

Pebble.addEventListener("appmessage",
                        function(e) {
                          console.log("AppMessage type: " + e.type);
                          console.log("AppMessage payload: " + JSON.stringify(e.payload));
                          var callback = messageCallbacks[e.payload["operation"]];
                          if (callback)
                            callback();
                            
                        });

// ==================== Local storage convenience functions ====================

function loadData(data_name, default_data) {
  var data = JSON.parse(window.localStorage.getItem(data_name));
  if (!data && default_data) {
    data = default_data;
    saveData(data_name, data);
  }
  return data;
}

function saveData(data_name, data) {
  window.localStorage.setItem(data_name, JSON.stringify(data));
}

function loadGlobalData() {
  streams = loadData("streams", { "categories":[] , "subscriptions":[] , "tags":[] , "topics":[] });
  special_streams  = loadData("special_streams", [ {"id": "global.all"} ]);
  configuration = loadData("configuration", { "logged_in": false });
  days_with_saved_entries = loadData("days_with_saved_entries", {});
  entries_size = loadData("entries_size", 0);
  entries_count = loadData("entries_count", 0);
}

function saveGlobalData() {
  saveData("streams", streams);
  saveData("special_streams", special_streams);
  saveData("configuration", configuration);
  saveData("days_with_saved_entries", days_with_saved_entries);
  saveData("entries_size", entries_size);
  saveData("entries_count", entries_count);
}

function deleteOldEntries(days_old) {
  // Any entries older than cut_off_day will be deleted.
  var cut_off_day = getDaysSinceEpoch() - days_old;
  for (var entries_age in days_with_saved_entries) {
    if (entries_age < cut_off_day) {
      deleteEntriesOfAge(entries_age);
    }
  }
}

function deleteEntriesOfAge(entries_age) {
  var entryIds = days_with_saved_entries[entries_age];
  
  if (!entryIds) {
    console.log("No entries of age " + entries_age);
  } else {
    entryIds.forEach(function(entryId) {
      var saved_entry = window.localStorage.getItem(entryId);
      
      if (saved_entry) {
        // Update statistics
        entries_size -= window.localStorage.getItem(entryId).length;
        
        // Remove entry
        window.localStorage.removeItem(entryId);
      } else {
        console.logWithTime("EntryId not in storage, so couldn't be deleted: " + entryId);
      }
    });
    
    // Update statistics
    entries_count -= entryIds.length;
    
    // Delete list of entryIds with the given age
    delete days_with_saved_entries[entries_age];
  }
}

// ==================== Time functions =================================

function getDaysSinceEpoch() {
  return Math.floor(new Date().getTime() / ms_in_day);
}

console.logWithTime = function(data) {
  this.log("[" + new Date().toUTCString() + "] " + data);
}

// ==================== Feedly convenience functions ====================


function synchroniseData() {
  downloadData(function() {
    console.logWithTime("Successfully downloaded data! " + entries_count + " entries = " 
    + entries_size/1024 + "kB. Local storage contains " + window.localStorage.length);
    saveGlobalData()
  }, function() {
    console.logWithTime("Failed to download data. Resetting...");
    loadGlobalData();
  })
}

function downloadData(success_callback, failure_callback) {
  
  var downloads_counter = new ProcessCompletionCounter(success_callback, failure_callback);
  
  // Download metadata (ie. stream subscriptions and entryIds)
  downloads_counter.add(1);
  downloadMetaData(function() {
    
    try {
      // Generate complete set of unique entryIds from all downloaded streams:
      var all_entryIds = {};
      console.logWithTime("Making entriesId set");
      for (var streamType in streams) {
        var stream_array = streams[streamType];
        stream_array.forEach(function(stream) {
          stream.entries.ids.forEach(function(entryId) {
            all_entryIds[entryId] = true;
          });
        });
      }
      
      special_streams.forEach(function(special_stream) {
        special_stream.entries.ids.forEach(function(entryId) {
          all_entryIds[entryId] = true;
        })
      });
      
      // Download entries
      console.logWithTime("Downloading entries");
      downloads_counter.add(1);
      downloadEntries(Object.keys(all_entryIds), function() {
        downloads_counter.markFinished(true);
      }, function() {
        downloads_counter.markFinished(false);
      })
      
      downloads_counter.markFinished(true);
    } catch (e) {
      downloads_counter.markFinished(false);
      throw e;
    }
    
  }, function() {
    downloads_counter.markFinished(false);
  });
}

function downloadMetaData(success_callback, failure_callback) {
  
  var downloads_counter = new ProcessCompletionCounter(success_callback, failure_callback);
  
  // Download subscribed streams and populate them with entryIds
  downloads_counter.add(Object.keys(streams).length);

  console.logWithTime("downloading streams");
  for (var streamType in streams) {
    downloadStreamsOfType(streamType, function() {
      downloads_counter.markFinished(true);
    },
    function() {
      downloads_counter.markFinished(false);
    });
  }
  
  // Download special streams (e.g. "global.all") and populate them with entryIds
  downloads_counter.add(Object.keys(special_streams).length);
  console.log("downloading special streams");
  special_streams.forEach(function(special_stream) {
    downloadStreamEntriesList(special_stream, function() {
      downloads_counter.markFinished(true);
    }, function() {
      downloads_counter.markFinished(false);
    });
  });
}

function downloadEntries(entryIds, success_callback, failure_callback) {
  var downloads_counter = new ProcessCompletionCounter(success_callback, failure_callback);
  
  // Remove entries that are already downloaded:
  console.logWithTime("filtering entryIds list from " + entryIds.length);
  entryIds = entryIds.filter(function(entryId) {
    // return true => keep entryID
    return loadData(entryId) == null;
  });
  console.logWithTime(" ... to a list of size: " + entryIds.length);
  
  // 
  downloads_counter.add(1);
  console.logWithTime("downloading entries");
  new JSONRequester("POST", feedly_url + "/v3/entries/.mget", {},
    function(entries_data) { // onload
      
      try {
        // For each entry_data...
        console.logWithTime("Procesing entries");
        entries_data.forEach(function(entry_data) {
          // Save entry_data
          saveData(entry_data.id, entry_data);
          
          // Get days since epoch that entry was published
          var days_since_epoch = entry_data.published / ms_in_day;
          
          // Index entry by days_since_epoch
          var saved_entries_on_day = days_with_saved_entries[days_since_epoch];
          if (!saved_entries_on_day) {
            saved_entries_on_day = [entry_data.id];
            days_with_saved_entries[days_since_epoch] = saved_entries_on_day;
          } else {
            saved_entries_on_day.push(entry_data.id);
          }
          
          // Update statistics
          var entry_size = window.localStorage.getItem(entry_data.id).length;
          entries_size += entry_size;
        });
        
        // Update statistics
        entries_count += entries_data.length;
        
        downloads_counter.markFinished(true);
        
      } catch (e) {
        downloads_counter.markFinished(false);
        throw e;
      }
    },
    function(e) {  // onerror
      console.log("Failed to entry data. " + JSON.stringify(e));
      downloads_counter.markFinished(false);
    }
  ).allowCompression().sendAuthenticated(entryIds);
}

function downloadStreamsOfType(streamType, success_callback, failure_callback) {
  if (!streams.hasOwnProperty(streamType)) {
    console.log("I don't know what this streamType is: " + streamType);
    return;
  }
  
  var downloads_counter = new ProcessCompletionCounter(success_callback, failure_callback);
  
  // Get list of streams
  downloads_counter.add(1);
  new JSONRequester("GET", feedly_enc_url + "/v3/" + streamType, {},
    function(new_streams) { // onload
      // Save new list of streams
      streams[streamType] = new_streams;
      
      downloads_counter.add(new_streams.length);
      
      // Download 
      new_streams.forEach(function(new_stream) {
        downloadStreamEntriesList(new_stream, function() {
          downloads_counter.markFinished(true);
        }, function() {
          downloads_counter.markFinished(false);
        });
      });
      
      downloads_counter.markFinished(true);
      
    }, function(e) {
      console.log("Failed to download list of streams of type: " + streamType);
      downloads_counter.markFinished(false);
    }
  ).sendAuthenticated();
  
}

function downloadStreamEntriesList(stream, success_callback, failure_callback) {
  
  // Download the list of entries for each stream
  new JSONRequester("GET", feedly_enc_url + "/v3/streams/ids", 
    {
      "streamId": stream.id,
      "count": 5,
      "ranked": "newest",
      "unreadOnly": false,
//       "newerThan": (timestamp in ms)
//       "continuation": (continuation ID for next page of entries)
    },
    function(new_entries) { // onload
      // Save entries inside stream object
      stream.entries = new_entries;
      success_callback();
    },
    function(e) {  // onerror
      console.log("Failed to download entry ids of stream: " + stream.id);
      failure_callback();
    }
  ).sendAuthenticated();
}
 

// ==================== Utility =========================================

function getFirstElementMatchingId(arr, id) {
  for (var i=0, tot=arr.length; i < tot; i++) {
    var element = arr[i];
    if (element.id == id)
      return element;
  }
  return null;
}

function getItemsAdded(from, to) {
  var set = {};
  
  // Populate the set
  to.forEach(function(element) {
    set[element] = true;
  });
  
  // Remove old values from set
  from.forEach(function(element) {
    delete set[element];
  });
  
  // Return added items as list
  return Object.keys(set);
}

function ProcessCompletionCounter(success_callback, failure_callback) {
  var running_processes = 0;
  var a_process_failed = false;
  
  this.add = function(extra_processes) { running_processes += extra_processes; }
  this.aProcessFailed = function() { return a_process_failed; }
  
  this.markFinished = function(successful) {
    running_processes--;
    a_process_failed = a_process_failed || !successful;
    
    if (running_processes < 0)
      throw "A process was marked done before being added to the counter";
      
    if (running_processes == 0) {
      if (a_process_failed) {
        if (failure_callback) 
          failure_callback();
      } else {
        if (success_callback)
          success_callback();
      }
    }
  }
}

// ==================== XMLHttpRequest convenience functions ============

function JSONRequester(requestType, url, params, onload, onerror) {

  // === Constructor ===
  
  var request;
  var attempts_left = 2;
  var using_auth;
  var that = this;
  var last_data = null;
  
  if (params) {
    var key_value_pairs = [];
    for (var key in params) {
      var value = params[key];
      key_value_pairs.push(encodeURIComponent(key) + "=" + encodeURIComponent(value));      
    }
    url += "?" + key_value_pairs.join("&");
  }
//   console.log("URL: " + url);
  createRequest();
  
  // ==== Private Methods ===
  
  function createRequest() {
    request = new XMLHttpRequest();
    request.open(requestType, url, true);
    request.setRequestHeader("Content-Type", "application/json");
//     console.log("Sending request to: " + url);
    
    request.onload = function(e) {
      if (request.readyState == 4 && request.status == 200) {
//         console.log("Response to "+url+" was: " + request.responseText);
        onload(JSON.parse(request.responseText));
      } else if (using_auth && request.status == 401 && attempts_left > 0) {
        attempts_left--;
        console.log("Access token was bad - removing it. " + attempts_left + " attempts left");
        console.log("Error " + request.status + " : " + request.statusText + ". Response: " + request.response);
        window.localStorage.removeItem("access_token");
        createRequest();
        that.sendAuthenticated(last_data);
      } else {
        request.onerror(e);
      }
    }
    
    request.onerror = function(e) {
      if (onerror)
        onerror(e);
      else
        console.log("Error " + request.status + " : " + request.statusText + " at URL: "+url+" Response: " + request.response);
    }
  }
  
  function sendObject(obj) {
    try {
      request.send(JSON.stringify(obj));
    } catch(e) {
      console.log("Error whilst sending!");
    }
  }
  
  // ==== Privileged Methods ====
  
  // Enable compression
  this.allowCompression = function() {
//     request.setRequestHeader('accept-encoding','gzip,deflate,sdch');
    return this;
  }
  
  // Send without authentication
  this.send = function(data) {
    using_auth = false;
    last_data = null;
    sendObject(data);
  }
  
  // Send with authentication
  this.sendAuthenticated = function(data) {
    using_auth = true;
    last_data = data;
  
    var access_token = window.localStorage.getItem("access_token");
    var refresh_token = window.localStorage.getItem("refresh_token");
    var oauth_token = window.localStorage.getItem("oauth_token");

//     console.log("access token is: " + access_token);
//     console.log("refresh token is: " + refresh_token);
//     console.log("oauth token is: " + oauth_token);

    // Check if access token exists and is valid:
    if (access_token) {
      // If access token exists, try using it.
      request.setRequestHeader("Authorization", "OAuth " + access_token);
      sendObject(data); 
      
    } else if (refresh_token) {
      // Access token didn't exist, so get new one from refresh token
      console.log("using refresh token to get new access token");

      // refresh token exists - try to generate new access token from it
      new JSONRequester("POST", feedly_enc_url + "/v3/auth/token", 
        {
          "refresh_token": refresh_token,
          "client_id": client_id,
          "client_secret": client_secret,
          "grant_type": "refresh_token"
        }, 
        function(response) { // onload
          // Save new access token:
          window.localStorage.setItem("access_token", response.access_token);
          console.log("Got new access token from refresh token");
          // Use access token in recursive call:
          that.sendAuthenticated(data);
        },
        function(e) { // onerror
          // Refresh token was invalid. Delete it and try getting new one from oauth_token
          console.log("Refresh token was invalid. Will attempt getting new one...");
          window.localStorage.removeItem("refresh_token");
          that.sendAuthenticated(data);
        }
      ).send();
      
    } else if (oauth_token) {
      // Both access and refresh tokens are undefined, so generate new ones from oauth_token
      console.log("Sending request to exchange OAuth for tokens...");
      new JSONRequester("POST", feedly_enc_url + "/v3/auth/token", 
        {
          "code": oauth_token,
          "client_id": client_id,
          "client_secret": client_secret,
          "redirect_uri": "http://localhost", // TODO: change to localhost if this fails...
          "state": null,
          "grant_type": "authorization_code"
        },
        function(response) { // onload
          // Save new access token:
          window.localStorage.setItem("access_token", response.access_token);
          window.localStorage.setItem("refresh_token", response.refresh_token);
          window.localStorage.setItem("user_id", response.id);
          console.log("Got new refresh and access tokens from OAuth token, user_id = " + response.id);
          // Use access token in recursive call:
          that.sendAuthenticated(data);
        },
        function(e) { // onerror
          console.log("OAuth was invalid. Received: " + JSON.stringify(e));
          window.localStorage.removeItem("oauth_token");
          window.localStorage.removeItem("user_id");
          that.sendAuthenticated(data);
        }
      ).send();
      
    } else {
      // There are no access, refresh or OAuth tokens!
      console.log("NO LOGIN CREDENTIALS!!");
      request.onerror();
    }
  }
}
