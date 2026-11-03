// AWS SDK v3 is already included in the Lambda nodejs20.x runtime.
const crypto = require('crypto');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, PutCommand } = require('@aws-sdk/lib-dynamodb');

const db = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE = process.env.TABLE_NAME;
const SECRET = process.env.TOKEN_SECRET;

const reply = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

const b64 = (s) => Buffer.from(s).toString('base64url');
const sign = (data) => crypto.createHmac('sha256', SECRET).update(data).digest('base64url');

function makeToken(email) {
  const payload = b64(JSON.stringify({ email, exp: Date.now() + 60 * 60 * 1000 }));
  return `${payload}.${sign(payload)}`;
}

function readToken(header = '') {
  const token = header.replace('Bearer ', '');
  const [payload, sig] = token.split('.');
  if (!payload || !sig || sig !== sign(payload)) return null;
  const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
  return data.exp > Date.now() ? data : null;
}

function hash(password, salt = crypto.randomBytes(16).toString('hex')) {
  const h = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, h };
}

exports.handler = async (event) => {
  try {
    const route = event.routeKey;
    const body = event.body ? JSON.parse(event.body) : {};

    if (route === 'POST /register') {
      const email = (body.email || '').trim().toLowerCase();
      if (!email || !body.password || body.password.length < 6)
        return reply(400, { message: 'Email and password (min 6 chars) required' });
      const { salt, h } = hash(body.password);
      try {
        await db.send(new PutCommand({
          TableName: TABLE,
          Item: { email, salt, hash: h, createdAt: new Date().toISOString() },
          ConditionExpression: 'attribute_not_exists(email)',
        }));
      } catch (e) {
        if (e.name === 'ConditionalCheckFailedException')
          return reply(409, { message: 'User already exists' });
        throw e;
      }
      return reply(201, { message: 'Registered' });
    }

    if (route === 'POST /login') {
      const email = (body.email || '').trim().toLowerCase();
      const res = await db.send(new GetCommand({ TableName: TABLE, Key: { email } }));
      const user = res.Item;
      if (!user) return reply(401, { message: 'Invalid credentials' });
      const { h } = hash(body.password || '', user.salt);
      const ok = crypto.timingSafeEqual(Buffer.from(h), Buffer.from(user.hash));
      if (!ok) return reply(401, { message: 'Invalid credentials' });
      return reply(200, { token: makeToken(email) });
    }

    if (route === 'GET /me') {
      const data = readToken(event.headers?.authorization);
      if (!data) return reply(401, { message: 'Unauthorized' });
      return reply(200, { email: data.email });
    }

    return reply(404, { message: 'Not found' });
  } catch (err) {
    console.error(err);
    return reply(500, { message: 'Server error' });
  }
};
