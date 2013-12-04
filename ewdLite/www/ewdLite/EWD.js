if (typeof CustomEvent === 'undefined') {
  // Typically for IE
  (function () {
    function CustomEvent ( event, params ) {
      params = params || { bubbles: false, cancelable: false, detail: undefined };
      var evt = document.createEvent( 'CustomEvent' );
      evt.initCustomEvent( event, params.bubbles, params.cancelable, params.detail );
      return evt;
     };
    if (window.CustomEvent) CustomEvent.prototype = window.CustomEvent.prototype;
    window.CustomEvent = CustomEvent;
  })();
}

var EWD = {
  version: {
    build: 5,
    date: '04 December 2013'
  }, 
  trace: false,
  initialised: false,
  show: function(id) {
    if (document.getElementById(id) !== null) {
      document.getElementById(id).style.display = '';
    }
  },
  hide: function(id) {
    if (document.getElementById(id) !== null) {
      document.getElementById(id).style.display = 'none';
    }
  },
  insertAfter: function(html, targetId) {
    var tag = document.createElement('div');
    tag.innerHTML = html;
  },
  json2XML: function(document, tagName, xml) {
    if (!xml) xml = '';
    var intRegex = /^\d+$/;
    var numericTagName = intRegex.test(+tagName);
    //console.log('tagName: ' + tagName);
    if (tagName && !numericTagName) xml = xml + '<' + tagName;
    var hasAttributes = false;
    var hasChildren = false;
    var property;
    var value;
    var text = '';

    for (property in document) {
      if (property.substring(0,1) === '#') {
        hasAttributes = true;
      }
      else if (property === '.text') {
        text = document[property];
      }
      //else if (!intRegex.test(property)) {
      else {
        hasChildren = true;
      }
    }

    if (hasAttributes) {
      for (property in document) {
        if (property.substring(0,1) === '#') {
          xml = xml + ' ' + property.substring(1) + '="' + document[property] + '"';
        }
      }
    }
    if (tagName && !numericTagName && hasChildren) xml = xml + '>';

    if (hasChildren) {
      for (property in document) {
        if (property.substring(0,1) !== '#') {
          if (typeof document[property] === 'object') {
            xml = this.json2XML(document[property], property, xml);
          }
          else {
            value = document[property];
            if (value !== '') {
              xml = xml + '<' + property + '>' + value + '</' + property + '>';
            }
            else {
              xml = xml + '<' + property + ' />';
            } 
          }
        }
      }
      if (tagName && !numericTagName) xml = xml + '</' + tagName + '>';
      return xml;
    }

    if (text !== '' && tagName) {
      xml = xml + '>' + text + '</' + tagName + '>';
      return xml;
    }

    xml = xml + ' />';
    return xml;

  },
  sockets: {
    log: false,
    handlerFunction: {},
    keepAlive: function(mins) {
      EWD.sockets.timeout = mins;
      setTimeout(function() {
        EWD.sockets.sendMessage({type: "keepAlive", message:  "1"});
        EWD.sockets.keepAlive(EWD.sockets.timeout);
      },EWD.sockets.timeout*60000);
    },

    submitForm: function(params) {
      var framework = EWD.application.framework || 'extjs';
      var payload = params.fields;
      if (framework === 'extjs') {
        payload = Ext.getCmp(params.id).getValues();
      }
      if (framework === 'bootstrap') {
          if (params.popover) {
            EWD.application.popover = params.popover;
            if (!EWD.application.popovers) EWD.application.popovers = {};
            if (!EWD.application.popovers[params.popover.buttonId]) {
              $('#' + params.popover.buttonId).popover({
                title: params.alertTitle || 'Error',
                content: 'Testing',
                placement: 'top',
                container: '#' + params.popover.container,
                trigger: 'manual'
              });
              $('#' + params.popover.buttonId).on('shown.bs.popover', function() {
                var time = params.popover.time || 4000;
                setTimeout(function() {
                  $('#' + params.popover.buttonId).popover('hide');
                },time);
              });
              EWD.application.popovers[params.popover.buttonId] = true;
            }
          }
          if (params.toastr) {
            if (params.toastr.target) {
              toastr.options.target = '#' + params.toastr.target;
            }
            else {
              toastr.options.target = 'body';
            }
          }
      }
      if (params.alertTitle) payload.alertTitle = params.alertTitle;
      //payload.js_framework = framework;
      EWD.sockets.sendMessage({
        type: params.messageType, 
        params: payload
      });
    }
  },
  readyEvent: new CustomEvent('ready',{
    detail: {
      message: 'EWD Initialised'
    }
  }),
  socketsReadyEvent: new CustomEvent('socketsReady',{
    detail: {
      message: 'Sockets Initialised'
    }
  }),
  ready: false,
  isReady: function() {
    if (!EWD.ready) {
      var body = document.getElementsByTagName('body')[0];
      body.addEventListener('ready', function(e) {
        (function(messageFunction) {
          if (typeof messageFunction === 'undefined') messageFunction = EWD.sockets.serverMessageHandler;
          var socket = io.connect();
          socket.on('connect', function() {
            if (typeof EWD.sockets.token !== 'undefined') {
              EWD.sockets.sendMessage({type: 'EWD.startSession'});
            }
          });
          socket.on('message', function(obj){
            if (EWD.sockets.log) {
              if (obj.type !== 'EWD.registered') {
                console.log("onMessage: " + JSON.stringify(obj));
              }
              else {
                console.log('Registered successfully');
              }
            }
            if (EWD.application) {
              if (obj.type === 'EWD.connected') {
                //EWD.sockets.sendMessage({type: 'EWD.register', application: EWD.application});
                var json = {
                  type: 'EWD.register', 
                  application: EWD.application,
                  message: '',
                  handlerModule: EWD.application.name,
                  lite: true
                };
                socket.json.send(JSON.stringify(json));
                return;
              }
            }
            else {
              console.log('Unable to register application: EWD.application has not been defined');
              return;
            }
            if (obj.type === 'EWD.registered') {
              EWD.sockets.sendMessage = (function() {
                var io = socket;
                var token = obj.token;
                var augment = function(params) {
                  if (typeof params.message === 'undefined') params.message = '';
                  params.token = token;
                  params.handlerModule = EWD.application.name;
                  params.lite = true;
                  return params;
                };
                return function(params) {
                  params = augment(params);
                  if (typeof console !== 'undefined') {
                    if (EWD.sockets.log) console.log("sendMessage: " + JSON.stringify(params));
                  }
                  io.json.send(JSON.stringify(params)); 
                };
              })();
              obj = null;
              socket = null;
              EWD.initialised = true;
              document.getElementsByTagName('body')[0].dispatchEvent(EWD.socketsReadyEvent);
              return;
            }

            if (obj.message) {
              var payloadType = obj.message.payloadType;
              if (payloadType === 'innerHTMLReplace') {
                var replacements = obj.message.replacements;
                var replacement;
                var prefix;
                for (var i = 0; i < replacements.length; i++) {
                  replacement = replacements[i];
                  prefix = replacement.prefix || '';
                  for (var idName in replacement.ids) {
                    document.getElementById(prefix + idName).innerHTML = replacement.ids[idName];
                  }
                }
              }
              if (payloadType === 'bootstrap') {
                var action = obj.message.action;
                if (action === 'replaceTables') {
                  var tables = obj.message.tables;
                  var tableNo;
                  var table;
                  var i;
                  var html;
                  var tableTag;
                  var columns;
                  var colNo;
                  var row;
                  for (tableNo = 0; tableNo < tables.length; tableNo++) {
                    table = tables[tableNo];
                    tableTag = document.getElementById(table.id);
                    html = '<thead><tr>';
                    columns = EWD.bootstrap.table[table.id].columns;
                    for (i = 0; i < columns.length; i++) {
                      if (columns[i].heading !== '') html = html + '<th>' + columns[i].heading + '</th>'; 
                    }
                    html = html + '</tr></thead>';
                    html = html + '<tbody>';
                    for (i = 0; i < table.content.length; i++) {
                      row = table.content[i];
                      html = html + '<tr>';
                      for (colNo = 0; colNo < columns.length; colNo++) {
                        html = html + '<td>' + row[columns[colNo].id] + '</td>';
                      }
                      html = html + '</tr>';
                    }
                    html = html + '</tbody>';
                    tableTag.innerHTML = html;
                  }
                }
              }
            }

            if (obj.type.indexOf('EWD.form.') !== -1) {
              if (obj.error) {
                var alertTitle = 'Form Error';
                if (obj.alertTitle) alertTitle = obj.alertTitle;
                if (EWD.application.framework === 'extjs') {
                  Ext.Msg.alert(alertTitle, obj.error);
                }
                else if (EWD.application.framework === 'bootstrap') {
                  if (typeof toastr !== 'undefined') {
                    toastr.clear();
                    toastr.error(obj.error);
                  }
                  else {
                    //var name = obj.type.substr(9);
                    //document.getElementById(name + 'AlertText').innerHTML = 'Error: ' + obj.error;
                    if (EWD.sockets.log) console.log("error = " + obj.error);
                    $('#' + EWD.application.popover.buttonId).popover('show');
                    $('#' + EWD.application.popover.container).find('div.popover-content').html(obj.error);
                  }
                }
                else {
                  alert(obj.error);
                }
                return;
              }
              else {
                if (EWD.application.framework === 'bootstrap') {
                  $('#loginBtn').popover('hide');
                }
              }
            }

            if (obj.type.indexOf('EWD.error') !== -1) {
              if (obj.error) {
                if (EWD.trace) console.log(obj.error);
              }
              return;
            }

            if (obj.type.indexOf('EWD.inject') !== -1) {
              if (obj.js) {
                if (EWD.trace) console.log(obj.js);
                try {
                  eval(obj.js);
                  if (obj.fn) eval(obj.fn);
                }
                catch(error) {
                  if (EWD.trace) {
                    console.log('EWD.inject failed:');
                    console.log(error);
                  }
                }
              }
              return;
            }

            if (typeof EWD.token !== 'undefined' && typeof EWD.sockets.handlerFunction[obj.type] !== 'undefined') {
              EWD.sockets.handlerFunction[obj.type](obj);
              obj = null;
              return;
            }

            if (EWD.onSocketMessage) {
              EWD.onSocketMessage(obj);
              obj = null;
              return;
            }
          });
        })();
      });
      body.addEventListener('socketsReady', function(e) {
        if (EWD.onSocketsReady) EWD.onSocketsReady();
      });
      body.dispatchEvent(EWD.readyEvent);
      EWD.ready = true;
      io = null;
    }
  },
  utils: {
    addOptions: function(options, selectTagId) {
      // EWD.utils.addOptions([{value: 'John', text: 'John Smith'}], 'doctor');
      if (options instanceof Array) {
        var selectTag = document.getElementById(selectTagId);
        for (var i = 0; i < options.length; i++) {
          EWD.utils.addOption(selectTag, options[i].value, options[i].text);
        }
      }
    },
    addOption: function(selectTag, value, text) {
      var optionTag = document.createElement('option');
      optionTag.setAttribute('value', value);
      optionTag.text = text;
      try {
        // for IE earlier than version 8
        selectTag.add(optionTag, selectTag.options[null]);
      }
      catch (err) {
        selectTag.add(optionTag,null);
      }
    } 
  }
};

