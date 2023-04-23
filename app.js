var express = require('express');
var path = require('path');
var createError = require('http-errors');
var httpProxy = require('express-http-proxy')
var amqplib = require('amqplib');

let messageChannel = null;
const pendingQueue = 'pending-requests';
const connectToMessaging = () => {
  amqplib.connect('amqp://localhost:8006')
          .then(conn => conn.createChannel())
          .then(ch => {
            messageChannel = ch;
            ch.assertQueue(pendingQueue);
          })
          .catch(err => {
            console.log('Failed to connect to message queues. ' + err);
          });
}

const proxyErrorHandler = async (req, err, next) => {
  sent = false;
  try {
    message = `${req.url} ${JSON.stringify(req.body)}`;
    sent = messageChannel.sendToQueue(pendingQueue, new Buffer.from(message));
  }
  catch {
    // pass
  }
  if (!sent) {
    next();
    return;
  }
  console.log('Something went wrong. Your request has been queued.');
  next();
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

app.get('/people(/*)?', (req, res, next) => {
  peopleServiceProxy(req, res, (err) => proxyErrorHandler(req, err, next));
});

var postsServiceProxy = httpProxy('http://hoot-api-posts:8002/posts')

app.get('/posts(/*)?', (req, res, next) => {
  postsServiceProxy(req, res, (err) => proxyErrorHandler(req, err, next));
});

var teamsServiceProxy = httpProxy('http://hoot-api-teams:8003/teams')

app.get('/teams(/*)?', (req, res, next) => {
  teamsServiceProxy(req, res, (err) => proxyErrorHandler(req, err, next));
});

var teamsServiceProxy = httpProxy('http://hoot-api-teams:8004/links')

app.get('/links(/*)?', (req, res, next) => {
  linksServiceProxy(req, res, (err) => proxyErrorHandler(req, err, next));
});

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  next(createError(404));
});

// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

connectToMessaging();

app.listen(8005, 
  () => console.log(`Server is running at port: 8005`));

module.exports = app;
