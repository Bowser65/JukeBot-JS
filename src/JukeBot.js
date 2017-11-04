config       = require('./config.json');
permissions  = require('../util/Permissions.js');

const extras = require('../util/extras.js');
const sf     = require('snekfetch');
const Eris   = require('../util/extensionLoader.js')(require('eris'));

const client = new Eris.Client(config.keys.discord, {
	disableEvents: extras.disable('GUILD_BAN_ADD', 'GUILD_BAN_REMOVE', 'MESSAGE_DELETE', 'MESSAGE_DELETE_BULK', 'MESSAGE_UPDATE', 'PRESENCE_UPDATE', 'TYPING_START', 'USER_UPDATE'),
	messageLimit: 0,
	maxShards: config.options.shards
});

guilds   = {};
prefixes = require('./prefixes.json');

client.on('ready', async () => {
	console.log(`[SYSTEM] Ready! (User: ${client.user.username})`);
	client.editStatus('online', { name: `${config.options.prefix}help | v${config.version}` });

	client.guilds.forEach(g => {
		if (!prefixes[g.id])
			prefixes[g.id] = config.options.prefix;

		if (!guilds[g.id])
			guilds[g.id] = { id: g.id, msgc: '', queue: [], svotes: [], repeat: 'None' };
	});
});

client.on('guildCreate', async (g) => {
	if ((g.members.filter(m => m.bot).length / g.members.size) >= 0.60) 
		return g.leave();

	prefixes[g.id] = config.options.prefix;
	guilds[g.id] = { id: g.id, msgc: '', queue: [], svotes: [], repeat: 'None' };

	if (!config.botlists) return;

	for (const list of config.botlists) 
		await sf.post(list.url.replace('_clientid', client.user.id)).send({ 'server_count': client.guilds.size }).set('Authorization', list.token);
})

client.on('guildDelete', g => {
	delete prefixes[g.id];
	delete guilds[g.id];

	if (!config.botlists || !config.botlists._clientid) return;
	if (config.botlists.dbots)
		sf.post(`https://bots.discord.pw/api/bots/${config.botlists._clientid}/stats`).send({ 'server_count': client.guilds.size }).set('Authorization', config.botlists.dbots).end();
	if (config.botlists.dbl)
		sf.post(`https://discordbots.org/api/bots/${config.botlists._clientid}/stats`).send({ 'server_count': client.guilds.size }).set('Authorization', config.botlists.dbl).end();
})

client.on('messageCreate', async (msg) => {
	if (msg.isFromDM || msg.author.bot || !guilds[msg.channel.guild.id] || msg.member.isBlocked) return;

	if (msg.mentions.find(m => m.id === client.user.id) && msg.content.toLowerCase().includes('help'))
		return msg.channel.createMessage({ embed: {
			color: config.options.embedColour,
			title: `Use ${prefixes[msg.channel.guild.id]}help for commands`
		}});

	if (!msg.content.startsWith(prefixes[msg.channel.guild.id]) || !msg.channel.hasPermissions(client.user.id, 'sendMessages', 'embedLinks')) return;

	let command = msg.content.slice(prefixes[msg.channel.guild.id].length).toLowerCase().split(' ')[0];
	const args  = msg.content.split(' ').slice(1);
	console.log(`${msg.author.username} > ${msg.content}`);

	/* Extras */
	msg.channel.guild.prefix = prefixes[msg.channel.guild.id];

	delete require.cache[require.resolve('./aliases.json')];
	let aliases = require('./aliases.json');
	if (aliases[command]) command = aliases[command];

	try {
		delete require.cache[require.resolve(`./commands/${command}`)];
		require(`./commands/${command}`).run(client, msg, args);
	} catch(e) {
		if (e.message.includes('Cannot find module') || e.message.includes('ENOENT')) return;
		msg.channel.createMessage({ embed: {
			color: config.options.embedColour,
			title: `${command} failed`,
			description: `The command failed to run. The error has been logged.`
		}});
		console.error(`[ERROR] ${e.message}\n${e.stack.split('\n')[0]}\n${e.stack.split('\n')[1]}`);
	}
})

client.connect();

process.on('uncaughtException', err => {
	console.log(err.message)
});
