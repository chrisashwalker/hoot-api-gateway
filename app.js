var express = require('express');
var path = require('path');
var createError = require('http-errors');
var httpProxy = require('express-http-proxy')
var amqplib = require('amqplib');

let messageChannel = null;
const pendingQueue = 'pending-requests';
const completedQueue = 'completed-requests';

const connectToMessaging = () => {
  amqplib.connect('amqp://hoot-message-queues')
          .then(conn => conn.createChannel())
          .then(ch => {
            messageChannel = ch;
            ch.assertQueue(pendingQueue);
            ch.assertQueue(completedQueue);
          })
          .then(() => {
            messageChannel.consume(pendingQueue, msg => {
              retryMessage(msg);
              messageChannel.ack(msg);
            })
          })
          .catch(err => {
            console.log('Failed to connect to message queues. ' + err);
          });
}

const retryMessage = (msg) => {
  let msgObj = JSON.parse(Buffer.from(msg.content).toString());
  let fetchOptions = { method: msgObj.method };
  if (fetchOptions.method != 'GET') {
    fetchOptions.body = msgObj.body;
  }
  fetch(msgObj.url, fetchOptions)
  .then(res => res.json())
  .then(json => {
    msgObj.response = json;
    messageChannel.sendToQueue(completedQueue, Buffer.from(JSON.stringify(msgObj)));
  });
}

var app = express();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, 'public')));

/* GET home page. */
app.get('/', function(req, res, next) {
  res.render('index', { title: 'Hoot API Gateway' });
});

// set proxies redirecting to Hoot APIs
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

var teamsServiceProxy = httpProxy('http://hoot-api-teams:8004/links')

app.all('/links(/*)?', (req, res, next) => {
  linksServiceProxy(req, res, next);
});

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  next(createError(404));
});

app.use(function(err, req, res, next) {
  var sent = false;
  try {
    message = {
      url: req.protocol + '://' + req.get('host') + req.originalUrl,
      body: req.body,
      method: req.method
    };
    sent = messageChannel.sendToQueue(pendingQueue, new Buffer.from(JSON.stringify(message)));
  }
  catch {
    //continue
  }
  if (sent) {
    next(createError('Something went wrong. Your request has been queued.'));
  }
  next();
});

// error handler
app.use(function(err, req, res, next) {

  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // send the error
  res.status(err.status || 500).send({ error: err });
});

app.listen(8005, 
  () => { 
    console.log(`Server is running at port: 8005`);
    connectToMessaging();
  });

module.exports = app;
