PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,password TEXT NOT NULL,name TEXT NOT NULL,avatar TEXT DEFAULT '',admin INTEGER DEFAULT 0,created TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id),expires INTEGER);
CREATE TABLE IF NOT EXISTS resets(token TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id),expires INTEGER);
CREATE TABLE IF NOT EXISTS quizzes(id TEXT PRIMARY KEY,owner TEXT REFERENCES users(id),title TEXT,description TEXT,category TEXT,difficulty TEXT,theme TEXT,cover TEXT,visibility TEXT DEFAULT 'public',status TEXT DEFAULT 'draft',settings TEXT,created TEXT DEFAULT CURRENT_TIMESTAMP,demo INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS questions(id TEXT PRIMARY KEY,quiz_id TEXT REFERENCES quizzes(id) ON DELETE CASCADE,position INTEGER,type TEXT,prompt TEXT,options TEXT,accepted TEXT,explanation TEXT,points INTEGER,active INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS attempts(id TEXT PRIMARY KEY,quiz_id TEXT REFERENCES quizzes(id),user_id TEXT REFERENCES users(id),name TEXT,started INTEGER,submitted INTEGER,deadline INTEGER,question_order TEXT,score REAL,maximum REAL,correct INTEGER,pending INTEGER DEFAULT 0,public INTEGER DEFAULT 0,preview INTEGER DEFAULT 0,quiz_snapshot TEXT);
CREATE TABLE IF NOT EXISTS responses(attempt_id TEXT REFERENCES attempts(id),question_id TEXT REFERENCES questions(id),answer TEXT,earned REAL,PRIMARY KEY(attempt_id,question_id));
CREATE TABLE IF NOT EXISTS bookmarks(user_id TEXT REFERENCES users(id),quiz_id TEXT REFERENCES quizzes(id) ON DELETE CASCADE,PRIMARY KEY(user_id,quiz_id));
CREATE TABLE IF NOT EXISTS reports(id TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id),quiz_id TEXT REFERENCES quizzes(id),reason TEXT,status TEXT DEFAULT 'open',created TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE VIEW IF NOT EXISTS answer_options AS
SELECT q.id question_id,CAST(j.key AS INTEGER) position,j.value label
FROM questions q,json_each(q.options) j;
CREATE VIEW IF NOT EXISTS leaderboard_records AS
SELECT id,quiz_id,user_id,name,score,maximum,(submitted-started) elapsed
FROM attempts WHERE public=1 AND submitted IS NOT NULL AND preview=0 AND pending=0;
