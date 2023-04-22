var express = require('express');
var path = require('path');
var createError = require('http-errors');
var httpProxy = require('express-http-proxy')

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
var peopleServiceProxy = httpProxy('http://localhost:8001/people')

app.get('/people(/*)?', (req, res, next) => {
  peopleServiceProxy(req, res, next)
});

var postsServiceProxy = httpProxy('http://localhost:8002/posts')

app.get('/posts(/*)?', (req, res, next) => {
  postsServiceProxy(req, res, next)
});

var teamsServiceProxy = httpProxy('http://localhost:8003/teams')

app.get('/teams(/*)?', (req, res, next) => {
  teamsServiceProxy(req, res, next)
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

app.listen(8004, 
  () => console.log(`Server is running at port: 8004`));

module.exports = app;
