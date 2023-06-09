var express = require('express');
var path = require('path');
var createError = require('http-errors');
var httpProxy = require('express-http-proxy')
var amqplib = require('amqplib');

const PORT = 8005;
let messageChannel = null;
const pendingQueue = 'pending-requests';
const completedQueue = 'completed-requests';
const failureMessage = 'Something went wrong. Your request has been queued.';

const connectToMessaging = () => {
  amqplib.connect('amqp://hoot-message-queues')
    .then(conn => conn.createChannel())
    .then(ch => {
      messageChannel = ch;
      // Create queues if they don't exist
      ch.assertQueue(pendingQueue);
      ch.assertQueue(completedQueue);
    })
    .then(() => {
      // Accept messages from pending request queue
      messageChannel.consume(pendingQueue, (msg) => {
        // Try to process request
        retryMessage(msg);
      });
    })
    .catch(err => {
      console.log('Failed to connect to message queues. ' + err);
    });
  }

const retryMessage = (msg) => {
  // Convert message to JSON object
  let msgObj = JSON.parse(Buffer.from(msg.content).toString());
  let fetchHeaders = new Headers();
  fetchHeaders.append('X-Hoot-Retry', 'True');
  let fetchOptions = { 
    method: msgObj.method,
    headers: fetchHeaders
  };
  // Add body for non-GET HTTP request
  if (fetchOptions.method != 'GET') {
    fetchOptions.body = msgObj.body;
  }
  // Submit request and then send the response to the completed request queue
  fetch(msgObj.url, fetchOptions)
    .then(res => { 
      if (res.status >= 200 && res.status < 300) {
        // Acknowledge message after handling it
        messageChannel.ack(msg);
        msgObj.response = res.json();
        messageChannel.sendToQueue(completedQueue, Buffer.from(JSON.stringify(msgObj)));
      } else {
        // Return to queue
        messageChannel.nack(msg);
      }
    })
    .catch(reason => {
      // Return to queue
      messageChannel.nack(msg);
    });
}

var app = express();

// View engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', function(req, res, next) {
  res.render('index', { title: 'Hoot API Gateway' });
});

/* Set HTTP proxies redirecting to Hoot API endpoints */

var peopleServiceProxy = httpProxy('http://hoot-api-people:8001/people')

app.all('/people(/*)?', (req, res, next) => {
  peopleServiceProxy(req, res, next);  
});

var postsServiceProxy = httpProxy('http://hoot-api-posts:8002/posts')

app.all('/posts(/*)?', (req, res, next) => {
  postsServiceProxy(req, res, next);
});

var teamsServiceProxy = httpProxy('http://hoot-api-teams:8003/teams')

app.all('/teams(/*)?', (req, res, next) => {
  teamsServiceProxy(req, res, next);
});

var linksServiceProxy = httpProxy('http://hoot-api-links:8004/links')

app.all('/links(/*)?', (req, res, next) => {
  linksServiceProxy(req, res, next);
});

/* End of endpoint declarations */

// Catch 404 and forward to error handler
app.use(function(req, res, next) {
  next(createError(404));
});

// Catch failed API requests and add them to the pending request queue
app.use(function(err, req, res, next) {

  // Don't repeat error handling for retried requests
  if (req.get('X-Hoot-Retry') == 'True'){
    next();
    return;
  }

  var messageSent = false;
  try {
    message = {
      url: req.protocol + '://' + req.get('host') + req.originalUrl,
      body: req.body,
      method: req.method
    };
    messageSent = messageChannel.sendToQueue(pendingQueue, new Buffer.from(JSON.stringify(message)));
  }
  catch {
    // Continue, we'll propagate the original error later
  }
  if (messageSent) {
    next(createError(failureMessage));
  }
  next();
});

// Error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // send the error
  res.status(err.status || 500).send({ error: err });
});

app.listen(PORT, 
  () => { 
    console.log(`Server is running at port: ${PORT}`);
    connectToMessaging();
  });

module.exports = app;
