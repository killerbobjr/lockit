var	path = require('path'),
	events = require('events'),
	util = require('util'),
	express = require('express'),
	chalk = require('chalk'),
	extend = require('node.extend'),
	Signup = require('lockit-signup'),
	Login = require('lockit-login'),
	ForgotPassword = require('lockit-forgot-password'),
	ChangeEmail = require('lockit-change-email'),
	DeleteAccount = require('lockit-delete-account'),
	utils = require('lockit-utils'),
	configDefault = require('./config.default.js');



/**
 * Lockit constructor function.
 *
 * @constructor
 * @param {Object} config
 */
var Lockit = module.exports = function(config, next)
{
	if(!(this instanceof Lockit))
	{
		return new Lockit(config, next);
	}

	this.config = config || {};
	var that = this;

	if(!this.config.db)
	{
		this.database();
	}
	if(!this.config.mail.emailType || !this.config.mail.emailSettings)
	{
		this.email();
	}

	// use default values for all values that aren't provided
	this.config = extend(true, {}, configDefault, this.config);

	// router
	this.router = express.Router();

	// create db adapter only once and pass it to modules
	var db = utils.getDatabase(this.config);
	this.adapter = this.config.db.adapter || require(db.adapter)(this.config, function(err, db)
		{
			if(err)
			{
				next(err);
			}
			else
			{
				// load all required modules
				that.signup = new Signup(that.config, that.adapter);
				that.login = new Login(that.config, that.adapter);
				that.deleteAccount = new DeleteAccount(that.config, that.adapter);
				that.forgotPassword = new ForgotPassword(that.config, that.adapter);
				that.changeEmail = new ChangeEmail(that.config, that.adapter);

				// send all GET requests for lockit routes to '/index.html'
				if(that.config.rest)
				{
					that.rest();
				}

				// expose name and email to template engine
				that.router.use(function(req, res, next)
					{
						res.locals.name = req.user ? req.user.name || '' : '';
						res.locals.email = req.user ? req.user.email || '' : '';
						next();
					});

				// add submodule routes
				that.router.use(that.signup.router);
				that.router.use(that.login.router);
				that.router.use(that.deleteAccount.router);
				that.router.use(that.forgotPassword.router);
				that.router.use(that.changeEmail.router);

				// pipe events to lockit
				var emitters = [that.signup, that.login, that.deleteAccount, that.forgotPassword, that.changeEmail];
				utils.pipe(emitters, that);

				// special event for quick start
				that.signup.on('signup::post', function(user)
					{
						if(that.config.db.url === 'sqlite://' && that.config.db.name === ':memory:')
						{
							message = 'http://localhost:3000/signup/' + user.signupToken;
							console.log(
								chalk.bgBlack.green('lockit'),
								chalk.bgBlack.yellow(message),
								'cmd + double click on os x'
							);
						}
						that.emit('signup::post', user);
					});

				events.EventEmitter.call(that);

				next();
			}
		});
};

util.inherits(Lockit, events.EventEmitter);



/**
 * Use SQLite as fallback database.
 *
 * @private
 */
Lockit.prototype.database = function()
{
	this.config.db = {
		url: 'sqlite://',
		name: ':memory:',
		collection: 'my_user_table'
	};
	var message = 'no db config found. Using SQLite.';
	console.log(chalk.bgBlack.green('lockit'), message);
};



/**
 * Stub emails.
 *
 * @private
 */
Lockit.prototype.email = function()
{
	var message = 'no email config found. Check your database for tokens.';
	console.log(chalk.bgBlack.green('lockit'), message);
};



/**
 * Send all routes to Single Page Application entry point.
 *
 * @private
 */
Lockit.prototype.rest = function()
{
	var that = this;
	var __parentDir = path.dirname(module.parent.filename);

	var routes = [
		this.config.signup.route,
		this.config.signup.resendRoute,
		this.config.signup.resendRoute + '/:token',
		this.config.login.route,
		this.config.login.logoutRoute,
		this.config.forgotPassword.route,
		this.config.forgotPassword.route + '/:token',
		this.config.changeEmail.route,
		this.config.changeEmail.route + '/:token',
		this.config.deleteAccount.route,
	];

	routes.forEach(function(route)
		{
			that.router.get(route, function(req, res)
				{
					// check if user would like to render a file or use static html
					if(that.config.rest.useViewEngine)
					{
						res.render(that.config.rest.index,
							{
								basedir: req.app.get('views')
							});
					}
					else
					{
						res.sendfile(path.join(__parentDir, that.config.rest.index));
					}
				});
		});
};
