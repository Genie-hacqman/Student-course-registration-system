import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { io as connect } from 'socket.io-client';
import app from '../../app.js';
import { initSocketServer } from '../../src/sockets/socket.server.js';
import { resetDatabase, loginAs, createStudent, sectionIdFor, auth, sequelize } from './helpers.js';
import request from 'supertest';

let server;
let io;
let url;

before(async () => {
  resetDatabase();
  server = http.createServer(app);
  io = initSocketServer(server);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  url = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  io.close();
  await new Promise((resolve) => server.close(resolve));
  await sequelize.close();
});

const once = (socket, event, timeoutMs = 3000) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${event}`)), timeoutMs);
    socket.once(event, (payload) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });

test('rejects connections without a valid token', async () => {
  const socket = connect(url, { auth: { token: 'bad' }, transports: ['websocket'], reconnection: false });
  const err = await once(socket, 'connect_error');
  assert.equal(err.message, 'UNAUTHORIZED');
  socket.close();
});

test('a watcher in the section room receives capacity updates when someone registers', async () => {
  const watcher = await createStudent(1);
  const { token } = await loginAs('student');
  const sectionId = await sectionIdFor('CS201');

  const socket = connect(url, { auth: { token: watcher.token }, transports: ['websocket'], reconnection: false });
  await once(socket, 'connect');
  const ack = await new Promise((resolve) => socket.emit('section:join', sectionId, resolve));
  assert.equal(ack.ok, true);

  const update = once(socket, 'course.capacity.updated');
  const res = await request(server).post('/api/registrations/items').set(auth(token)).send({ courseSectionId: sectionId });
  assert.equal(res.status, 201);

  const payload = await update;
  assert.equal(payload.sectionId, sectionId);
  assert.equal(payload.seatsTaken, 1);
  assert.equal(payload.seatsAvailable, payload.capacity - 1);
  socket.close();
});

test('the registering student receives timetable.updated on their personal room', async () => {
  const { token } = await loginAs('student');
  const socket = connect(url, { auth: { token }, transports: ['websocket'], reconnection: false });
  await once(socket, 'connect');

  const event = once(socket, 'timetable.updated');
  const res = await request(server).post('/api/registrations/items').set(auth(token)).send({ courseSectionId: await sectionIdFor('MATH201') });
  assert.equal(res.status, 201);
  assert.ok((await event).registrationId);
  socket.close();
});

test('a logged-out token cannot open a socket, and open sockets are disconnected on logout', async () => {
  const { token, cookie } = await loginAs('lecturer');
  const socket = connect(url, { auth: { token }, transports: ['websocket'], reconnection: false });
  await once(socket, 'connect');

  const disconnected = once(socket, 'disconnect');
  const res = await request(server).post('/api/auth/logout').set(auth(token)).set('Cookie', cookie);
  assert.equal(res.status, 200);
  assert.equal(await disconnected, 'io server disconnect');

  const retry = connect(url, { auth: { token }, transports: ['websocket'], reconnection: false });
  const err = await once(retry, 'connect_error');
  assert.equal(err.message, 'UNAUTHORIZED');
  retry.close();
});

test('logout-all disconnects every socket of the user', async () => {
  const a = await loginAs('registrar');
  const b = await loginAs('registrar');
  const sockets = [a, b].map((s) => connect(url, { auth: { token: s.token }, transports: ['websocket'], reconnection: false }));
  await Promise.all(sockets.map((s) => once(s, 'connect')));

  const gone = Promise.all(sockets.map((s) => once(s, 'disconnect')));
  assert.equal((await request(server).post('/api/auth/logout-all').set(auth(a.token))).status, 200);
  assert.deepEqual(await gone, ['io server disconnect', 'io server disconnect']);
});
