const request = require('supertest');
const faker = require('faker');
const httpStatus = require('http-status');
const app = require('../../src/app');
const setupTestDB = require('../utils/setupTestDB');
const { User, AuditLog } = require('../../src/models');
const { userOne, userTwo, admin, insertUsers } = require('../fixtures/user.fixture');
const { userOneAccessToken, adminAccessToken } = require('../fixtures/token.fixture');
const { notesLimiter } = require('../../src/middlewares/rateLimiter');

setupTestDB();

describe('User routes', () => {
  afterEach(() => notesLimiter.resetKey('::ffff:127.0.0.1'));

  describe('POST /v1/users', () => {
    let newUser;

    beforeEach(() => {
      newUser = {
        name: faker.name.findName(),
        email: faker.internet.email().toLowerCase(),
        password: 'password1',
        role: 'user',
      };
    });

    test('should return 201 and successfully create new user if data is ok', async () => {
      await insertUsers([admin]);

      const res = await request(app)
        .post('/v1/users')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send(newUser)
        .expect(httpStatus.CREATED);

      expect(res.body).not.toHaveProperty('password');
      expect(res.body).toEqual({
        id: expect.anything(),
        name: newUser.name,
        email: newUser.email,
        role: newUser.role,
        isEmailVerified: false,
        isTwoFactorEnabled: false,
      });

      const dbUser = await User.findById(res.body.id);
      expect(dbUser).toBeDefined();
      expect(dbUser.password).not.toBe(newUser.password);
      expect(dbUser).toMatchObject({ name: newUser.name, email: newUser.email, role: newUser.role, isEmailVerified: false });
    });

    test('should be able to create an admin as well', async () => {
      await insertUsers([admin]);
      newUser.role = 'admin';

      const res = await request(app)
        .post('/v1/users')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send(newUser)
        .expect(httpStatus.CREATED);

      expect(res.body.role).toBe('admin');

      const dbUser = await User.findById(res.body.id);
      expect(dbUser.role).toBe('admin');
    });

    test('should return 401 error if access token is missing', async () => {
      await request(app).post('/v1/users').send(newUser).expect(httpStatus.UNAUTHORIZED);
    });

    test('should return 403 error if logged in user is not admin', async () => {
      await insertUsers([userOne]);

      await request(app)
        .post('/v1/users')
        .set('Authorization', `Bearer ${userOneAccessToken}`)
        .send(newUser)
        .expect(httpStatus.FORBIDDEN);
    });

    test('should return 400 error if email is invalid', async () => {
      await insertUsers([admin]);
      newUser.email = 'invalidEmail';

      await request(app)
        .post('/v1/users')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send(newUser)
        .expect(httpStatus.BAD_REQUEST);
    });

    test('should return 400 error if email is already used', async () => {
      await insertUsers([admin, userOne]);
      newUser.email = userOne.email;

      await request(app)
        .post('/v1/users')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send(newUser)
        .expect(httpStatus.BAD_REQUEST);
    });

    test('should return 400 error if password length is less than 8 characters', async () => {
      await insertUsers([admin]);
      newUser.password = 'passwo1';

      await request(app)
        .post('/v1/users')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send(newUser)
        .expect(httpStatus.BAD_REQUEST);
    });

    test('should return 400 error if password does not contain both letters and numbers', async () => {
      await insertUsers([admin]);
      newUser.password = 'password';

      await request(app)
        .post('/v1/users')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send(newUser)
        .expect(httpStatus.BAD_REQUEST);

      newUser.password = '1111111';

      await request(app)
        .post('/v1/users')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send(newUser)
        .expect(httpStatus.BAD_REQUEST);
    });

    test('should return 400 error if role is neither user nor admin', async () => {
      await insertUsers([admin]);
      newUser.role = 'invalid';

      await request(app)
        .post('/v1/users')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send(newUser)
        .expect(httpStatus.BAD_REQUEST);
    });
  });

  describe('GET /v1/users', () => {
    test('should return 200 and apply the default query options', async () => {
      await insertUsers([userOne, userTwo, admin]);

      const res = await request(app)
        .get('/v1/users')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send()
        .expect(httpStatus.OK);

      expect(res.body).toEqual({
        results: expect.any(Array),
        page: 1,
        limit: 10,
        totalPages: 1,
        totalResults: 3,
      });
      expect(res.body.results).toHaveLength(3);
      expect(res.body.results[0]).toEqual({
        id: userOne._id.toHexString(),
        name: userOne.name,
        email: userOne.email,
        role: userOne.role,
        isEmailVerified: userOne.isEmailVerified,
        isTwoFactorEnabled: false,
      });
    });

    test('should return 401 if access token is missing', async () => {
      await insertUsers([userOne, userTwo, admin]);

      await request(app).get('/v1/users').send().expect(httpStatus.UNAUTHORIZED);
    });

    test('should return 403 if a non-admin is trying to access all users', async () => {
      await insertUsers([userOne, userTwo, admin]);

      await request(app)
        .get('/v1/users')
        .set('Authorization', `Bearer ${userOneAccessToken}`)
        .send()
        .expect(httpStatus.FORBIDDEN);
    });

    test('should correctly apply filter on name field', async () => {
      await insertUsers([userOne, userTwo, admin]);

      const res = await request(app)
        .get('/v1/users')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .query({ name: userOne.name })
        .send()
        .expect(httpStatus.OK);

      expect(res.body).toEqual({
        results: expect.any(Array),
        page: 1,
        limit: 10,
        totalPages: 1,
        totalResults: 1,
      });
      expect(res.body.results).toHaveLength(1);
      expect(res.body.results[0].id).toBe(userOne._id.toHexString());
    });

    test('should correctly apply filter on role field', async () => {
      await insertUsers([userOne, userTwo, admin]);

      const res = await request(app)
        .get('/v1/users')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .query({ role: 'user' })
        .send()
        .expect(httpStatus.OK);

      expect(res.body).toEqual({
        results: expect.any(Array),
        page: 1,
        limit: 10,
        totalPages: 1,
        totalResults: 2,
      });
      expect(res.body.results).toHaveLength(2);
      expect(res.body.results[0].id).toBe(userOne._id.toHexString());
      expect(res.body.results[1].id).toBe(userTwo._id.toHexString());
    });

    test('should correctly sort the returned array if descending sort param is specified', async () => {
      await insertUsers([userOne, userTwo, admin]);

      const res = await request(app)
        .get('/v1/users')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .query({ sortBy: 'role:desc' })
        .send()
        .expect(httpStatus.OK);

      expect(res.body).toEqual({
        results: expect.any(Array),
        page: 1,
        limit: 10,
        totalPages: 1,
        totalResults: 3,
      });
      expect(res.body.results).toHaveLength(3);
      expect(res.body.results[0].id).toBe(userOne._id.toHexString());
      expect(res.body.results[1].id).toBe(userTwo._id.toHexString());
      expect(res.body.results[2].id).toBe(admin._id.toHexString());
    });

    test('should correctly sort the returned array if ascending sort param is specified', async () => {
      await insertUsers([userOne, userTwo, admin]);

      const res = await request(app)
        .get('/v1/users')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .query({ sortBy: 'role:asc' })
        .send()
        .expect(httpStatus.OK);

      expect(res.body).toEqual({
        results: expect.any(Array),
        page: 1,
        limit: 10,
        totalPages: 1,
        totalResults: 3,
      });
      expect(res.body.results).toHaveLength(3);
      expect(res.body.results[0].id).toBe(admin._id.toHexString());
      expect(res.body.results[1].id).toBe(userOne._id.toHexString());
      expect(res.body.results[2].id).toBe(userTwo._id.toHexString());
    });

    test('should correctly sort the returned array if multiple sorting criteria are specified', async () => {
      await insertUsers([userOne, userTwo, admin]);

      const res = await request(app)
        .get('/v1/users')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .query({ sortBy: 'role:desc,name:asc' })
        .send()
        .expect(httpStatus.OK);

      expect(res.body).toEqual({
        results: expect.any(Array),
        page: 1,
        limit: 10,
        totalPages: 1,
        totalResults: 3,
      });
      expect(res.body.results).toHaveLength(3);

      const expectedOrder = [userOne, userTwo, admin].sort((a, b) => {
        if (a.role < b.role) {
          return 1;
        }
        if (a.role > b.role) {
          return -1;
        }
        return a.name < b.name ? -1 : 1;
      });

      expectedOrder.forEach((user, index) => {
        expect(res.body.results[index].id).toBe(user._id.toHexString());
      });
    });

    test('should limit returned array if limit param is specified', async () => {
      await insertUsers([userOne, userTwo, admin]);

      const res = await request(app)
        .get('/v1/users')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .query({ limit: 2 })
        .send()
        .expect(httpStatus.OK);

      expect(res.body).toEqual({
        results: expect.any(Array),
        page: 1,
        limit: 2,
        totalPages: 2,
        totalResults: 3,
      });
      expect(res.body.results).toHaveLength(2);
      expect(res.body.results[0].id).toBe(userOne._id.toHexString());
      expect(res.body.results[1].id).toBe(userTwo._id.toHexString());
    });

    test('should return the correct page if page and limit params are specified', async () => {
      await insertUsers([userOne, userTwo, admin]);

      const res = await request(app)
        .get('/v1/users')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .query({ page: 2, limit: 2 })
        .send()
        .expect(httpStatus.OK);

      expect(res.body).toEqual({
        results: expect.any(Array),
        page: 2,
        limit: 2,
        totalPages: 2,
        totalResults: 3,
      });
      expect(res.body.results).toHaveLength(1);
      expect(res.body.results[0].id).toBe(admin._id.toHexString());
    });

    test('should filter by isEmailVerified=true and return only verified users', async () => {
      const verifiedUser = { ...userOne, _id: userOne._id, isEmailVerified: true };
      await insertUsers([userTwo, admin]);
      await insertUsers([verifiedUser]);

      const res = await request(app)
        .get('/v1/users')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .query({ isEmailVerified: true })
        .send()
        .expect(httpStatus.OK);

      expect(res.body.totalResults).toBe(1);
      expect(res.body.results[0].id).toBe(userOne._id.toHexString());
      expect(res.body.results[0].isEmailVerified).toBe(true);
    });

    test('should filter by isEmailVerified=false and return only unverified users', async () => {
      const verifiedUser = { ...userOne, _id: userOne._id, isEmailVerified: true };
      await insertUsers([userTwo, admin]);
      await insertUsers([verifiedUser]);

      const res = await request(app)
        .get('/v1/users')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .query({ isEmailVerified: false })
        .send()
        .expect(httpStatus.OK);

      expect(res.body.totalResults).toBe(2);
      res.body.results.forEach((u) => expect(u.isEmailVerified).toBe(false));
    });

    test('should return 400 if role filter is not a valid role', async () => {
      await insertUsers([admin]);

      await request(app)
        .get('/v1/users')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .query({ role: 'superadmin' })
        .send()
        .expect(httpStatus.BAD_REQUEST);
    });

    test('should return 400 if sortBy format is invalid', async () => {
      await insertUsers([admin]);

      await request(app)
        .get('/v1/users')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .query({ sortBy: 'name' })
        .send()
        .expect(httpStatus.BAD_REQUEST);
    });

    test('should return 400 if limit is less than 1', async () => {
      await insertUsers([admin]);

      await request(app)
        .get('/v1/users')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .query({ limit: 0 })
        .send()
        .expect(httpStatus.BAD_REQUEST);
    });

    test('should return 400 if limit exceeds 100', async () => {
      await insertUsers([admin]);

      await request(app)
        .get('/v1/users')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .query({ limit: 101 })
        .send()
        .expect(httpStatus.BAD_REQUEST);
    });

    test('should return 400 if page is less than 1', async () => {
      await insertUsers([admin]);

      await request(app)
        .get('/v1/users')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .query({ page: 0 })
        .send()
        .expect(httpStatus.BAD_REQUEST);
    });

    test('should accept limit=100 (boundary) without error', async () => {
      await insertUsers([admin]);

      const res = await request(app)
        .get('/v1/users')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .query({ limit: 100 })
        .send()
        .expect(httpStatus.OK);

      expect(res.body.limit).toBe(100);
    });

    test('should accept page=1 (boundary) without error', async () => {
      await insertUsers([admin]);

      const res = await request(app)
        .get('/v1/users')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .query({ page: 1 })
        .send()
        .expect(httpStatus.OK);

      expect(res.body.page).toBe(1);
    });

    test('should accept multi-field sortBy in valid format', async () => {
      await insertUsers([userOne, userTwo, admin]);

      const res = await request(app)
        .get('/v1/users')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .query({ sortBy: 'role:asc,name:desc' })
        .send()
        .expect(httpStatus.OK);

      expect(res.body.results).toHaveLength(3);
      // admin comes first (role:'admin' < role:'user' alphabetically)
      expect(res.body.results[0].role).toBe('admin');
    });
  });

  describe('GET /v1/users/:userId', () => {
    test('should return 200 and the user object if data is ok', async () => {
      await insertUsers([userOne]);

      const res = await request(app)
        .get(`/v1/users/${userOne._id}`)
        .set('Authorization', `Bearer ${userOneAccessToken}`)
        .send()
        .expect(httpStatus.OK);

      expect(res.body).not.toHaveProperty('password');
      expect(res.body).toEqual({
        id: userOne._id.toHexString(),
        email: userOne.email,
        name: userOne.name,
        role: userOne.role,
        isEmailVerified: userOne.isEmailVerified,
        isTwoFactorEnabled: false,
      });
    });

    test('should return 401 error if access token is missing', async () => {
      await insertUsers([userOne]);

      await request(app).get(`/v1/users/${userOne._id}`).send().expect(httpStatus.UNAUTHORIZED);
    });

    test('should return 403 error if user is trying to get another user', async () => {
      await insertUsers([userOne, userTwo]);

      await request(app)
        .get(`/v1/users/${userTwo._id}`)
        .set('Authorization', `Bearer ${userOneAccessToken}`)
        .send()
        .expect(httpStatus.FORBIDDEN);
    });

    test('should return 200 and the user object if admin is trying to get another user', async () => {
      await insertUsers([userOne, admin]);

      await request(app)
        .get(`/v1/users/${userOne._id}`)
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send()
        .expect(httpStatus.OK);
    });

    test('should return 400 error if userId is not a valid mongo id', async () => {
      await insertUsers([admin]);

      await request(app)
        .get('/v1/users/invalidId')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send()
        .expect(httpStatus.BAD_REQUEST);
    });

    test('should return 404 error if user is not found', async () => {
      await insertUsers([admin]);

      await request(app)
        .get(`/v1/users/${userOne._id}`)
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send()
        .expect(httpStatus.NOT_FOUND);
    });
  });

  describe('DELETE /v1/users/:userId', () => {
    test('should return 204 if data is ok', async () => {
      await insertUsers([userOne]);

      await request(app)
        .delete(`/v1/users/${userOne._id}`)
        .set('Authorization', `Bearer ${userOneAccessToken}`)
        .send()
        .expect(httpStatus.NO_CONTENT);

      const dbUser = await User.findById(userOne._id);
      expect(dbUser).toBeNull();
    });

    test('should return 401 error if access token is missing', async () => {
      await insertUsers([userOne]);

      await request(app).delete(`/v1/users/${userOne._id}`).send().expect(httpStatus.UNAUTHORIZED);
    });

    test('should return 403 error if user is trying to delete another user', async () => {
      await insertUsers([userOne, userTwo]);

      await request(app)
        .delete(`/v1/users/${userTwo._id}`)
        .set('Authorization', `Bearer ${userOneAccessToken}`)
        .send()
        .expect(httpStatus.FORBIDDEN);
    });

    test('should return 204 if admin is trying to delete another user', async () => {
      await insertUsers([userOne, admin]);

      await request(app)
        .delete(`/v1/users/${userOne._id}`)
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send()
        .expect(httpStatus.NO_CONTENT);
    });

    test('should return 400 error if userId is not a valid mongo id', async () => {
      await insertUsers([admin]);

      await request(app)
        .delete('/v1/users/invalidId')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send()
        .expect(httpStatus.BAD_REQUEST);
    });

    test('should return 404 error if user already is not found', async () => {
      await insertUsers([admin]);

      await request(app)
        .delete(`/v1/users/${userOne._id}`)
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send()
        .expect(httpStatus.NOT_FOUND);
    });
  });

  describe('PATCH /v1/users/:userId', () => {
    test('should return 200 and successfully update user if data is ok', async () => {
      await insertUsers([userOne]);
      const updateBody = {
        name: faker.name.findName(),
        email: faker.internet.email().toLowerCase(),
        password: 'newPassword1',
      };

      const res = await request(app)
        .patch(`/v1/users/${userOne._id}`)
        .set('Authorization', `Bearer ${userOneAccessToken}`)
        .send(updateBody)
        .expect(httpStatus.OK);

      expect(res.body).not.toHaveProperty('password');
      expect(res.body).toEqual({
        id: userOne._id.toHexString(),
        name: updateBody.name,
        email: updateBody.email,
        role: 'user',
        isEmailVerified: false,
        isTwoFactorEnabled: false,
      });

      const dbUser = await User.findById(userOne._id);
      expect(dbUser).toBeDefined();
      expect(dbUser.password).not.toBe(updateBody.password);
      expect(dbUser).toMatchObject({ name: updateBody.name, email: updateBody.email, role: 'user' });
    });

    test('should return 401 error if access token is missing', async () => {
      await insertUsers([userOne]);
      const updateBody = { name: faker.name.findName() };

      await request(app).patch(`/v1/users/${userOne._id}`).send(updateBody).expect(httpStatus.UNAUTHORIZED);
    });

    test('should return 403 if user is updating another user', async () => {
      await insertUsers([userOne, userTwo]);
      const updateBody = { name: faker.name.findName() };

      await request(app)
        .patch(`/v1/users/${userTwo._id}`)
        .set('Authorization', `Bearer ${userOneAccessToken}`)
        .send(updateBody)
        .expect(httpStatus.FORBIDDEN);
    });

    test('should return 200 and successfully update user if admin is updating another user', async () => {
      await insertUsers([userOne, admin]);
      const updateBody = { name: faker.name.findName() };

      await request(app)
        .patch(`/v1/users/${userOne._id}`)
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send(updateBody)
        .expect(httpStatus.OK);
    });

    test('should return 404 if admin is updating another user that is not found', async () => {
      await insertUsers([admin]);
      const updateBody = { name: faker.name.findName() };

      await request(app)
        .patch(`/v1/users/${userOne._id}`)
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send(updateBody)
        .expect(httpStatus.NOT_FOUND);
    });

    test('should return 400 error if userId is not a valid mongo id', async () => {
      await insertUsers([admin]);
      const updateBody = { name: faker.name.findName() };

      await request(app)
        .patch(`/v1/users/invalidId`)
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send(updateBody)
        .expect(httpStatus.BAD_REQUEST);
    });

    test('should return 400 if email is invalid', async () => {
      await insertUsers([userOne]);
      const updateBody = { email: 'invalidEmail' };

      await request(app)
        .patch(`/v1/users/${userOne._id}`)
        .set('Authorization', `Bearer ${userOneAccessToken}`)
        .send(updateBody)
        .expect(httpStatus.BAD_REQUEST);
    });

    test('should return 400 if email is already taken', async () => {
      await insertUsers([userOne, userTwo]);
      const updateBody = { email: userTwo.email };

      await request(app)
        .patch(`/v1/users/${userOne._id}`)
        .set('Authorization', `Bearer ${userOneAccessToken}`)
        .send(updateBody)
        .expect(httpStatus.BAD_REQUEST);
    });

    test('should not return 400 if email is my email', async () => {
      await insertUsers([userOne]);
      const updateBody = { email: userOne.email };

      await request(app)
        .patch(`/v1/users/${userOne._id}`)
        .set('Authorization', `Bearer ${userOneAccessToken}`)
        .send(updateBody)
        .expect(httpStatus.OK);
    });

    test('should return 400 if password length is less than 8 characters', async () => {
      await insertUsers([userOne]);
      const updateBody = { password: 'passwo1' };

      await request(app)
        .patch(`/v1/users/${userOne._id}`)
        .set('Authorization', `Bearer ${userOneAccessToken}`)
        .send(updateBody)
        .expect(httpStatus.BAD_REQUEST);
    });

    test('should return 400 if password does not contain both letters and numbers', async () => {
      await insertUsers([userOne]);
      const updateBody = { password: 'password' };

      await request(app)
        .patch(`/v1/users/${userOne._id}`)
        .set('Authorization', `Bearer ${userOneAccessToken}`)
        .send(updateBody)
        .expect(httpStatus.BAD_REQUEST);

      updateBody.password = '11111111';

      await request(app)
        .patch(`/v1/users/${userOne._id}`)
        .set('Authorization', `Bearer ${userOneAccessToken}`)
        .send(updateBody)
        .expect(httpStatus.BAD_REQUEST);
    });
  });

  describe('PATCH /v1/users/:userId/notes', () => {
    test('should return 200 and update notes if admin sends valid data', async () => {
      await insertUsers([userOne, admin]);
      const updateBody = { notes: 'Some notes about this user.' };

      const res = await request(app)
        .patch(`/v1/users/${userOne._id}/notes`)
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send(updateBody)
        .expect(httpStatus.OK);

      expect(res.body).toMatchObject({ id: userOne._id.toHexString(), notes: updateBody.notes });

      const dbUser = await User.findById(userOne._id);
      expect(dbUser).toBeDefined();
      expect(dbUser.notes).toBe(updateBody.notes);
    });

    test('should return 400 if notes field is missing from body', async () => {
      await insertUsers([admin]);

      await request(app)
        .patch(`/v1/users/${userOne._id}/notes`)
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({})
        .expect(httpStatus.BAD_REQUEST);
    });

    test('should return 400 if notes is an empty string', async () => {
      await insertUsers([admin]);

      await request(app)
        .patch(`/v1/users/${userOne._id}/notes`)
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({ notes: '' })
        .expect(httpStatus.BAD_REQUEST);
    });

    test('should return 400 if notes exceeds 1000 characters', async () => {
      await insertUsers([admin]);
      const updateBody = { notes: 'a'.repeat(1001) };

      await request(app)
        .patch(`/v1/users/${userOne._id}/notes`)
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send(updateBody)
        .expect(httpStatus.BAD_REQUEST);
    });

    test('should return 400 if userId is not a valid mongo id', async () => {
      await insertUsers([admin]);

      await request(app)
        .patch('/v1/users/invalidId/notes')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({ notes: 'Some notes.' })
        .expect(httpStatus.BAD_REQUEST);
    });

    test('should return 404 if userId does not exist', async () => {
      await insertUsers([admin]);

      await request(app)
        .patch(`/v1/users/${userOne._id}/notes`)
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({ notes: 'Some notes.' })
        .expect(httpStatus.NOT_FOUND);
    });

    test('should return 401 if access token is missing', async () => {
      await insertUsers([userOne]);

      await request(app)
        .patch(`/v1/users/${userOne._id}/notes`)
        .send({ notes: 'Some notes.' })
        .expect(httpStatus.UNAUTHORIZED);
    });

    test('should return 403 if requester is not an admin', async () => {
      await insertUsers([userOne]);

      await request(app)
        .patch(`/v1/users/${userOne._id}/notes`)
        .set('Authorization', `Bearer ${userOneAccessToken}`)
        .send({ notes: 'Some notes.' })
        .expect(httpStatus.FORBIDDEN);
    });

    test('should return 429 after exceeding the rate limit', async () => {
      await insertUsers([admin]);
      const MAX = 50;

      // Requests that return an error still count toward this limiter.
      for (let i = 0; i < MAX; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        await request(app)
          .patch(`/v1/users/${userOne._id}/notes`)
          .set('Authorization', `Bearer ${adminAccessToken}`)
          .send({ notes: 'Some notes.' });
      }

      await request(app)
        .patch(`/v1/users/${userOne._id}/notes`)
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({ notes: 'Some notes.' })
        .expect(httpStatus.TOO_MANY_REQUESTS);
    }, 20000);
  });

  describe('Audit logging for PATCH /v1/users/:userId/notes', () => {
    test('should create an audit log entry when notes are updated successfully', async () => {
      await insertUsers([userOne, admin]);
      const updateBody = { notes: 'Audited note.' };

      await request(app)
        .patch(`/v1/users/${userOne._id}/notes`)
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send(updateBody)
        .expect(httpStatus.OK);

      // Give the fire-and-forget log write a tick to settle
      await new Promise((resolve) => setImmediate(resolve));

      const logs = await AuditLog.find({ targetUser: userOne._id });
      expect(logs).toHaveLength(1);

      const log = logs[0];
      expect(log.action).toBe('UPDATE_USER_NOTES');
      expect(log.performedBy.toHexString()).toBe(admin._id.toHexString());
      expect(log.targetUser.toHexString()).toBe(userOne._id.toHexString());
      expect(log.metadata).toMatchObject({ notes: updateBody.notes });
    });

    test('should not create an audit log entry when validation fails', async () => {
      await insertUsers([admin]);

      await request(app)
        .patch(`/v1/users/${userOne._id}/notes`)
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({})
        .expect(httpStatus.BAD_REQUEST);

      await new Promise((resolve) => setImmediate(resolve));

      const logs = await AuditLog.find({ targetUser: userOne._id });
      expect(logs).toHaveLength(0);
    });

    test('should not create an audit log entry when the target user does not exist', async () => {
      await insertUsers([admin]);

      await request(app)
        .patch(`/v1/users/${userOne._id}/notes`)
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({ notes: 'Some note.' })
        .expect(httpStatus.NOT_FOUND);

      await new Promise((resolve) => setImmediate(resolve));

      const logs = await AuditLog.find({ targetUser: userOne._id });
      expect(logs).toHaveLength(0);
    });
  });

  describe('PATCH /v1/users/:userId/avatar', () => {
    // Minimal valid JPEG (smallest possible compliant header + EOI)
    const minimalJpeg = Buffer.from(
      'ffd8ffe000104a46494600010100000100010000' + // SOI + APP0
        'ffdb004300080606070605080707070909080a0c140d0c0b0b0c1912130f141d1a1f1e1d1a1c1c20242e2720222c231c1c2837292c30313434341f27393d38323c2e333432' +
        'ffc0000b080001000101011100' + // SOF0: 1x1 greyscale
        'ffc4001f0000010501010101010100000000000000000102030405060708090a0b' + // DHT
        'ffda00080101003f00fab500' + // SOS + minimal scan data
        'ffd9', // EOI
      'hex'
    );
    // Minimal valid PNG (1×1 white pixel)
    const minimalPng = Buffer.from(
      '89504e470d0a1a0a' + // PNG signature
        '0000000d49484452000000010000000108020000009001' + // IHDR chunk (1x1, RGB)
        '2e0000000c4944415478016360f8cfc00000000200019e' + // IDAT chunk
        '221de2000000000049454e44ae426082', // IEND chunk
      'hex'
    );

    test('should return 200 and update avatarPath when admin uploads a valid JPEG', async () => {
      await insertUsers([userOne, admin]);

      const res = await request(app)
        .patch(`/v1/users/${userOne._id}/avatar`)
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .attach('avatar', minimalJpeg, { filename: 'photo.jpg', contentType: 'image/jpeg' })
        .expect(httpStatus.OK);

      expect(res.body.avatarPath).toMatch(/^\/uploads\/avatar-\d+-\d+\.jpg$/);

      const dbUser = await User.findById(userOne._id);
      expect(dbUser.avatarPath).toBe(res.body.avatarPath);
    });

    test('should return 200 and update avatarPath when admin uploads a valid PNG', async () => {
      await insertUsers([userOne, admin]);

      const res = await request(app)
        .patch(`/v1/users/${userOne._id}/avatar`)
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .attach('avatar', minimalPng, { filename: 'photo.png', contentType: 'image/png' })
        .expect(httpStatus.OK);

      expect(res.body.avatarPath).toMatch(/^\/uploads\/avatar-\d+-\d+\.png$/);
    });

    test('should return 400 when no file is attached', async () => {
      await insertUsers([admin]);

      await request(app)
        .patch(`/v1/users/${userOne._id}/avatar`)
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(httpStatus.BAD_REQUEST);
    });

    test('should return 400 when file MIME type is not JPEG or PNG', async () => {
      await insertUsers([admin]);
      const gifBuffer = Buffer.from('47494638396101000100000000003b', 'hex'); // GIF87a 1x1

      await request(app)
        .patch(`/v1/users/${userOne._id}/avatar`)
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .attach('avatar', gifBuffer, { filename: 'anim.gif', contentType: 'image/gif' })
        .expect(httpStatus.BAD_REQUEST);
    });

    test('should return 400 when file exceeds the 2 MB size limit', async () => {
      await insertUsers([admin]);
      const oversized = Buffer.alloc(2 * 1024 * 1024 + 1); // 2 MB + 1 byte

      await request(app)
        .patch(`/v1/users/${userOne._id}/avatar`)
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .attach('avatar', oversized, { filename: 'big.jpg', contentType: 'image/jpeg' })
        .expect(httpStatus.BAD_REQUEST);
    });

    test('should return 400 when userId is not a valid mongo id', async () => {
      await insertUsers([admin]);

      await request(app)
        .patch('/v1/users/invalidId/avatar')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .attach('avatar', minimalJpeg, { filename: 'photo.jpg', contentType: 'image/jpeg' })
        .expect(httpStatus.BAD_REQUEST);
    });

    test('should return 404 when target user does not exist', async () => {
      await insertUsers([admin]);

      await request(app)
        .patch(`/v1/users/${userOne._id}/avatar`)
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .attach('avatar', minimalJpeg, { filename: 'photo.jpg', contentType: 'image/jpeg' })
        .expect(httpStatus.NOT_FOUND);
    });

    test('should return 401 when access token is missing', async () => {
      await insertUsers([userOne]);

      await request(app)
        .patch(`/v1/users/${userOne._id}/avatar`)
        .attach('avatar', minimalJpeg, { filename: 'photo.jpg', contentType: 'image/jpeg' })
        .expect(httpStatus.UNAUTHORIZED);
    });

    test('should return 403 when requester is not an admin', async () => {
      await insertUsers([userOne]);

      await request(app)
        .patch(`/v1/users/${userOne._id}/avatar`)
        .set('Authorization', `Bearer ${userOneAccessToken}`)
        .attach('avatar', minimalJpeg, { filename: 'photo.jpg', contentType: 'image/jpeg' })
        .expect(httpStatus.FORBIDDEN);
    });
  });

  describe('GET /v1/users/export', () => {
    describe('JSON format (default)', () => {
      test('should return 200 and a JSON array of all users when admin requests', async () => {
        await insertUsers([userOne, userTwo, admin]);

        const res = await request(app)
          .get('/v1/users/export')
          .set('Authorization', `Bearer ${adminAccessToken}`)
          .expect(httpStatus.OK);

        expect(res.headers['content-type']).toMatch(/application\/json/);
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body).toHaveLength(3);
      });

      test('should not include password or twoFactorSecret in any record', async () => {
        await insertUsers([userOne, admin]);

        const res = await request(app)
          .get('/v1/users/export')
          .set('Authorization', `Bearer ${adminAccessToken}`)
          .expect(httpStatus.OK);

        res.body.forEach((record) => {
          expect(record).not.toHaveProperty('password');
          expect(record).not.toHaveProperty('twoFactorSecret');
        });
      });

      test('should include expected public fields in each record', async () => {
        await insertUsers([userOne, admin]);

        const res = await request(app)
          .get('/v1/users/export')
          .set('Authorization', `Bearer ${adminAccessToken}`)
          .expect(httpStatus.OK);

        const record = res.body.find((u) => u.id === userOne._id.toHexString());
        expect(record).toBeDefined();
        expect(record).toMatchObject({
          id: userOne._id.toHexString(),
          name: userOne.name,
          email: userOne.email,
          role: userOne.role,
          isEmailVerified: userOne.isEmailVerified,
        });
      });

      test('should return the authenticated admin when it is the only user', async () => {
        await insertUsers([admin]);

        const res = await request(app)
          .get('/v1/users/export')
          .set('Authorization', `Bearer ${adminAccessToken}`)
          .expect(httpStatus.OK);

        expect(res.body).toHaveLength(1);
        expect(res.body[0].id).toBe(admin._id.toHexString());
      });

      test('should return 200 with JSON when ?format=json is passed', async () => {
        await insertUsers([admin]);

        const res = await request(app)
          .get('/v1/users/export')
          .query({ format: 'json' })
          .set('Authorization', `Bearer ${adminAccessToken}`)
          .expect(httpStatus.OK);

        expect(Array.isArray(res.body)).toBe(true);
      });
    });

    describe('CSV format', () => {
      test('should return CSV with correct Content-Type and Content-Disposition when ?format=csv', async () => {
        await insertUsers([userOne, admin]);

        const res = await request(app)
          .get('/v1/users/export')
          .query({ format: 'csv' })
          .set('Authorization', `Bearer ${adminAccessToken}`)
          .expect(httpStatus.OK);

        expect(res.headers['content-type']).toMatch(/text\/csv/);
        expect(res.headers['content-disposition']).toBe('attachment; filename="users.csv"');
      });

      test('should return CSV with correct header row', async () => {
        await insertUsers([admin]);

        const res = await request(app)
          .get('/v1/users/export')
          .query({ format: 'csv' })
          .set('Authorization', `Bearer ${adminAccessToken}`)
          .expect(httpStatus.OK);

        const lines = res.text.split('\n');
        expect(lines[0]).toBe('id,name,email,role,isEmailVerified,notes,avatarPath,isTwoFactorEnabled');
      });

      test('should return one data row per user in CSV', async () => {
        await insertUsers([userOne, userTwo, admin]);

        const res = await request(app)
          .get('/v1/users/export')
          .query({ format: 'csv' })
          .set('Authorization', `Bearer ${adminAccessToken}`)
          .expect(httpStatus.OK);

        const lines = res.text.split('\n').filter(Boolean);
        // 1 header + 3 data rows
        expect(lines).toHaveLength(4);
      });

      test('should include correct values in the data row for a known user', async () => {
        await insertUsers([userOne, admin]);

        const res = await request(app)
          .get('/v1/users/export')
          .query({ format: 'csv' })
          .set('Authorization', `Bearer ${adminAccessToken}`)
          .expect(httpStatus.OK);

        expect(res.text).toContain(userOne.email);
        expect(res.text).toContain(userOne.name);
      });

      test('should return CSV when Accept: text/csv header is sent', async () => {
        await insertUsers([admin]);

        const res = await request(app)
          .get('/v1/users/export')
          .set('Authorization', `Bearer ${adminAccessToken}`)
          .set('Accept', 'text/csv')
          .expect(httpStatus.OK);

        expect(res.headers['content-type']).toMatch(/text\/csv/);
      });

      test('should not include password or twoFactorSecret columns in CSV', async () => {
        await insertUsers([admin]);

        const res = await request(app)
          .get('/v1/users/export')
          .query({ format: 'csv' })
          .set('Authorization', `Bearer ${adminAccessToken}`)
          .expect(httpStatus.OK);

        expect(res.text).not.toContain('password');
        expect(res.text).not.toContain('twoFactorSecret');
      });
    });

    describe('Access control', () => {
      test('should return 401 when no access token is provided', async () => {
        await request(app).get('/v1/users/export').expect(httpStatus.UNAUTHORIZED);
      });

      test('should return 403 when a non-admin requests the export', async () => {
        await insertUsers([userOne]);

        await request(app)
          .get('/v1/users/export')
          .set('Authorization', `Bearer ${userOneAccessToken}`)
          .expect(httpStatus.FORBIDDEN);
      });
    });

    describe('Validation', () => {
      test('should return 400 when ?format has an unrecognised value', async () => {
        await insertUsers([admin]);

        await request(app)
          .get('/v1/users/export')
          .query({ format: 'xml' })
          .set('Authorization', `Bearer ${adminAccessToken}`)
          .expect(httpStatus.BAD_REQUEST);
      });
    });
  });
});
