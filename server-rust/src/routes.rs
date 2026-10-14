use crate::{db::Db, security::*, *};
use rand::seq::SliceRandom;
use serde_json::{json, Value};
use uuid::Uuid;

pub struct Reply {
    pub data: Value,
    pub cookie: Option<String>,
}
impl From<Value> for Reply {
    fn from(data: Value) -> Self {
        Self { data, cookie: None }
    }
}
fn ok() -> Value {
    json!({"ok": true})
}
fn limit(s: &str, n: usize) -> String {
    s.chars().take(n).collect()
}
fn number(v: &Value) -> f64 {
    v.as_f64()
        .or_else(|| text(v).parse().ok())
        .unwrap_or(f64::NAN)
}
fn bool_value(v: &Value) -> bool {
    v.as_bool().unwrap_or(false)
}
fn quiz(db: &Db, id: &str) -> ApiResult<Value> {
    db.get("SELECT q.*,COALESCE(u.name,'QuizCraft Studio') creator FROM quizzes q LEFT JOIN users u ON u.id=q.owner WHERE q.id=?", &[json!(id)])
}
fn attempt(db: &Db, id: &str, user: &Value) -> ApiResult<Value> {
    let a = db.get("SELECT * FROM attempts WHERE id=?", &[json!(id)])?;
    if a.is_null() || (!a["user_id"].is_null() && a["user_id"] != user["id"]) {
        return Err(ApiError::new(404, "Attempt not found."));
    }
    Ok(a)
}
fn expired(a: &Value) -> bool {
    a["deadline"]
        .as_i64()
        .is_some_and(|deadline| now() > deadline)
}

pub fn dispatch(db: &Db, method: &str, path: &str, body: &Value, token: &str) -> ApiResult<Reply> {
    let user = if token.is_empty() {
        Value::Null
    } else {
        session_user(db, token)?
    };
    let parts: Vec<&str> = path.trim_matches('/').split('/').collect();
    let data = match (method, parts.as_slice()) {
        ("GET", ["api", "me"]) => public_user(&user),
        ("POST", ["api", "auth", "register"]) => {
            let email = email(&body["email"]);
            let password = text(&body["password"]);
            let name = text(&body["name"]).trim();
            if !regex::Regex::new(r"^\S+@\S+\.\S+$").unwrap().is_match(&email) || name.is_empty() || !(10..=256).contains(&password.chars().count()) {
                return Err(ApiError::new(400,"Enter a name, valid email, and password between 10 and 256 characters."));
            }
            if !db.get("SELECT id FROM users WHERE email=?", &[json!(email)])?.is_null() { return Err(ApiError::new(409,"This email is already registered.")); }
            let id = json!(Uuid::new_v4().to_string());
            db.run("INSERT INTO users(id,email,password,name,admin) VALUES(?,?,?,?,0)", &[id.clone(),json!(email),json!(password_hash(password)?),json!(limit(name,80))])?;
            return Ok(Reply { data: public_user(&db.get("SELECT * FROM users WHERE id=?", &[id.clone()])?), cookie: Some(session(db,&id)?) });
        }
        ("POST", ["api", "auth", "login"]) => {
            let u = db.get("SELECT * FROM users WHERE email=?", &[json!(email(&body["email"]))])?;
            if u.is_null() || text(&body["password"]).len() > 1024 || !verify(text(&body["password"]),text(&u["password"])) { return Err(ApiError::new(401,"Email or password is incorrect.")); }
            return Ok(Reply { data: public_user(&u), cookie: Some(session(db,&u["id"])?) });
        }
        ("POST", ["api", "auth", "logout"]) => {
            db.run("DELETE FROM sessions WHERE token=?", &[json!(hash(token))])?;
            return Ok(Reply { data: ok(), cookie: Some("qc=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0".into()) });
        }
        ("POST", ["api", "auth", "forgot"]) => {
            let webhook = std::env::var("EMAIL_WEBHOOK_URL").unwrap_or_default();
            if webhook.is_empty() { return Err(ApiError::new(503,"Password reset email is not configured. Contact the site administrator.")); }
            let u = db.get("SELECT * FROM users WHERE email=?", &[json!(email(&body["email"]))])?;
            if !u.is_null() {
                let token = secret();
                db.run("INSERT INTO resets VALUES(?,?,?)", &[json!(hash(&token)),u["id"].clone(),json!(now()+3600000)])?;
                let origin = std::env::var("APP_ORIGIN").unwrap_or_else(|_| "http://localhost:5173".into());
                let client = reqwest::blocking::Client::builder().timeout(std::time::Duration::from_secs(15)).build().map_err(ApiError::internal)?;
                let response = client.post(webhook).bearer_auth(std::env::var("EMAIL_WEBHOOK_TOKEN").unwrap_or_default()).json(&json!({"to":u["email"],"subject":"Reset your QuizCraft password","url":format!("{origin}/?reset={token}")})).send();
                if !response.is_ok_and(|r| r.status().is_success()) { return Err(ApiError::new(502,"Email delivery failed. Please try again.")); }
            }
            ok()
        }
        ("POST", ["api", "auth", "reset"]) => {
            let r = db.get("SELECT * FROM resets WHERE token=? AND expires>?", &[json!(hash(text(&body["token"]))),json!(now())])?;
            if r.is_null() || !(10..=256).contains(&text(&body["password"]).chars().count()) { return Err(ApiError::new(400,"Invalid or expired link, or password is shorter than 10 characters.")); }
            let password = password_hash(text(&body["password"]))?;
            db.transaction(|| {
                db.run("UPDATE users SET password=? WHERE id=?", &[json!(password),r["user_id"].clone()])?;
                db.run("DELETE FROM resets WHERE user_id=?", &[r["user_id"].clone()])?;
                db.run("DELETE FROM sessions WHERE user_id=?", &[r["user_id"].clone()])?;
                Ok(ok())
            })?
        }
        ("PATCH", ["api", "profile"]) => {
            let id = auth(&user)?;
            let name = text(&body["name"]);
            let avatar = text(&body["avatar"]);
            if name.trim().is_empty() || name.chars().count()>80 || (!avatar.is_empty() && !avatar.starts_with("https://")) { return Err(ApiError::new(400,"Use a name up to 80 characters and an HTTPS avatar URL.")); }
            db.run("UPDATE users SET name=?,avatar=? WHERE id=?", &[json!(name.trim()),json!(avatar),id.clone()])?;
            public_user(&db.get("SELECT * FROM users WHERE id=?", &[id.clone()])?)
        }
        ("GET", ["api", "categories"]) => json!(db.all("SELECT DISTINCT category FROM quizzes WHERE demo=0 AND owner IS NOT NULL AND status!='deleted' AND ((status='published' AND visibility='public') OR owner=?) ORDER BY category COLLATE NOCASE", &[json!(text(&user["id"]))])?.iter().map(|q|q["category"].clone()).collect::<Vec<_>>()),
        ("DELETE", ["api", "categories"]) => {
            let id = auth(&user)?;
            let name = text(&body["name"]).split_whitespace().collect::<Vec<_>>().join(" ");
            if name.is_empty() || name.chars().count()>60 || name=="Uncategorized" { return Err(ApiError::new(400,"Choose a category to delete.")); }
            let updated = db.run("UPDATE quizzes SET category='Uncategorized' WHERE owner=? AND category=? AND status!='deleted' AND demo=0", &[id.clone(),json!(name)])?;
            json!({"ok":true,"updated":updated})
        }
        ("GET", ["api", "quizzes"]) => json!(db.all("SELECT q.*,u.name creator,(SELECT COUNT(*) FROM questions WHERE quiz_id=q.id AND active=1) questionCount,(SELECT COUNT(*) FROM attempts WHERE quiz_id=q.id AND submitted IS NOT NULL AND preview=0) plays FROM quizzes q JOIN users u ON q.owner=u.id WHERE q.demo=0 AND q.status='published' AND q.visibility='public' ORDER BY q.created DESC", &[])?.into_iter().map(parse_quiz).collect::<Vec<_>>()),
        ("GET", ["api", "library"]) => {
            let id = auth(&user)?;
            json!({
                "quizzes":db.all("SELECT q.*,(SELECT COUNT(*) FROM questions WHERE quiz_id=q.id AND active=1) questionCount,(SELECT COUNT(*) FROM attempts WHERE quiz_id=q.id AND submitted IS NOT NULL AND preview=0) plays FROM quizzes q WHERE owner=? AND status!='deleted' ORDER BY created DESC", &[id.clone()])?.into_iter().map(parse_quiz).collect::<Vec<_>>(),
                "bookmarks":db.all("SELECT quiz_id FROM bookmarks WHERE user_id=?", &[id.clone()])?.iter().map(|r|r["quiz_id"].clone()).collect::<Vec<_>>(),
                "saved":db.all("SELECT q.*,COALESCE(u.name,'QuizCraft Studio') creator,(SELECT COUNT(*) FROM questions WHERE quiz_id=q.id AND active=1) questionCount FROM quizzes q JOIN bookmarks b ON b.quiz_id=q.id LEFT JOIN users u ON u.id=q.owner WHERE b.user_id=? AND ((q.status='published' AND q.visibility!='private') OR q.owner=?)", &[id.clone(),id.clone()])?.into_iter().map(parse_quiz).collect::<Vec<_>>(),
                "attempts":db.all("SELECT a.id,a.quiz_id,a.name,a.score,a.maximum,a.correct,a.submitted,a.started,a.pending,q.title FROM attempts a JOIN quizzes q ON q.id=a.quiz_id WHERE a.user_id=? AND a.submitted IS NOT NULL AND a.preview=0 AND q.status!='deleted' AND q.demo=0 ORDER BY a.submitted DESC,a.started DESC,a.rowid DESC", &[id.clone()])?
            })
        }
        ("GET", ["api", "quizzes", id]) => {
            let q = quiz(db,id)?;
            if !readable(&user,&q) { return Err(ApiError::new(404,"Quiz not found or access denied.")); }
            let qs = questions(db,&q["id"])?;
            let mut result = parse_quiz(q.clone());
            result["questionCount"]=json!(qs.len());
            if owner(&user,&q) { result["questions"]=json!(qs); }
            result
        }
        ("POST", ["api", "quizzes"]) => {
            let owner = auth(&user)?;
            let id = json!(Uuid::new_v4().to_string());
            db.run("INSERT INTO quizzes(id,owner,title,description,category,difficulty,theme,cover,settings) VALUES(?,?,'Untitled quiz','','General Knowledge','Easy','purple','',?)", &[id.clone(),owner.clone(),json!(json!({"guests":true,"review":true,"showAnswers":true,"rankings":true,"passing":60,"time":0,"layout":"single"}).to_string())])?;
            json!({"id":id})
        }
        ("PUT", ["api", "quizzes", id]) => {
            auth(&user)?;
            let old = quiz(db,id)?;
            if old.is_null() || old["status"]=="deleted" { return Err(ApiError::new(404,"Quiz not found.")); }
            if !owner(&user,&old) { return Err(ApiError::new(403,"You can edit only your own quizzes.")); }
            validate(body,body["status"]=="published")?;
            db.transaction(|| {
                let category = text(&body["category"]).split_whitespace().collect::<Vec<_>>().join(" ");
                db.run("UPDATE quizzes SET title=?,description=?,category=?,difficulty=?,theme=?,cover=?,visibility=?,status=?,settings=? WHERE id=?", &[
                    body["title"].clone(),json!(text(&body["description"])),json!(category),body["difficulty"].clone(),json!(if text(&body["theme"]).is_empty(){"purple"}else{text(&body["theme"])}),json!(if text(&body["cover"]).starts_with("https://"){text(&body["cover"])}else{""}),body["visibility"].clone(),json!(if body["status"]=="published"{"published"}else{"draft"}),json!(body["settings"].to_string()),json!(id)])?;
                db.run("UPDATE questions SET active=0 WHERE quiz_id=?", &[json!(id)])?;
                for (i,q) in body["questions"].as_array().unwrap().iter().enumerate() { insert_question(db,&json!(id),i,q)?; }
                Ok(ok())
            })?
        }
        ("DELETE", ["api", "quizzes", id]) => {
            let uid=auth(&user)?;
            let q=quiz(db,id)?;
            if q.is_null() || q["status"]=="deleted" { return Err(ApiError::new(404,"Quiz not found.")); }
            if !owner(&user,&q) { return Err(ApiError::new(403,"You can delete only your own quizzes.")); }
            db.transaction(|| {
                db.run("UPDATE quizzes SET status='deleted',visibility='private' WHERE id=?", &[json!(id)])?;
                db.run("DELETE FROM bookmarks WHERE quiz_id=?", &[json!(id)])?;
                db.run("UPDATE attempts SET preview=1,public=0 WHERE quiz_id=? AND user_id=?", &[json!(id),uid.clone()])?;
                Ok(ok())
            })?
        }
        ("POST", ["api", "quizzes", id, "duplicate"]) => {
            auth(&user)?;
            let q=quiz(db,id)?;
            if !readable(&user,&q) || !owner(&user,&q) { return Err(ApiError::new(403,"Access denied.")); }
            let new_id=json!(Uuid::new_v4().to_string());
            db.transaction(|| {
                db.run("INSERT INTO quizzes SELECT ?,owner,title||' (copy)',description,category,difficulty,theme,cover,visibility,'draft',settings,CURRENT_TIMESTAMP,0 FROM quizzes WHERE id=?", &[new_id.clone(),json!(id)])?;
                for (i,q) in questions(db,&json!(id))?.iter().enumerate() { insert_question(db,&new_id,i,q)?; }
                Ok(json!({"id":new_id}))
            })?
        }
        ("POST", ["api", "bookmarks", id]) => {
            let uid=auth(&user)?;
            if !readable(&user,&quiz(db,id)?) { return Err(ApiError::new(404,"Quiz not found.")); }
            if bool_value(&body["saved"]) { db.run("INSERT OR IGNORE INTO bookmarks VALUES(?,?)", &[uid.clone(),json!(id)])?; }
            else { db.run("DELETE FROM bookmarks WHERE user_id=? AND quiz_id=?", &[uid.clone(),json!(id)])?; }
            ok()
        }
        ("POST", ["api", "quizzes", id, "start"]) => start(db,&user,id,body)?,
        ("PUT", ["api", "attempts", id, "answers"]) => {
            let a=attempt(db,id,&user)?;
            if !a["submitted"].is_null() || expired(&a) { return Err(ApiError::new(409,"This attempt has ended.")); }
            db.transaction(|| {
                for q in attempt_questions(db,&a)? {
                    if let Some(answer)=body["answers"].get(text(&q["id"])) {
                        db.run("INSERT INTO responses VALUES(?,?,?,NULL) ON CONFLICT(attempt_id,question_id) DO UPDATE SET answer=excluded.answer", &[json!(id),q["id"].clone(),json!(limit(text(answer),10000))])?;
                    }
                }
                Ok(ok())
            })?
        }
        ("POST", ["api", "attempts", id, "submit"]) => submit(db,&attempt(db,id,&user)?,body)?,
        ("GET", ["api", "quizzes", id, "leaderboard"]) => {
            let q=quiz(db,id)?;
            if !readable(&user,&q) || !bool_value(&parse_quiz(q)["settings"]["rankings"]) { json!([]) }
            else { json!(db.all("SELECT name,score,maximum,elapsed FROM leaderboard_records WHERE quiz_id=? ORDER BY score/maximum DESC,elapsed ASC LIMIT 20", &[json!(id)])?) }
        }
        ("POST", ["api", "reports"]) => {
            let uid=auth(&user)?;
            if text(&body["reason"]).trim().is_empty() || db.get("SELECT id FROM quizzes WHERE id=?", &[body["quizId"].clone()])?.is_null() { return Err(ApiError::new(400,"Choose a quiz and enter a reason.")); }
            db.run("INSERT INTO reports(id,user_id,quiz_id,reason) VALUES(?,?,?,?)", &[json!(Uuid::new_v4().to_string()),uid.clone(),body["quizId"].clone(),json!(limit(text(&body["reason"]),2000))])?;
            ok()
        }
        ("GET", ["api", "admin"]) => {
            admin(&user)?;
            json!({"users":db.get("SELECT COUNT(*) n FROM users", &[])?["n"],"quizzes":db.get("SELECT COUNT(*) n FROM quizzes", &[])?["n"],"attempts":db.get("SELECT COUNT(*) n FROM attempts WHERE submitted IS NOT NULL", &[])?["n"],
                "reports":db.all("SELECT r.*,q.title FROM reports r JOIN quizzes q ON q.id=r.quiz_id ORDER BY r.created DESC", &[])?,
                "pending":db.all("SELECT r.*,a.name,a.quiz_id,q.prompt FROM responses r JOIN attempts a ON a.id=r.attempt_id JOIN questions q ON q.id=r.question_id WHERE r.earned IS NULL AND a.submitted IS NOT NULL AND a.preview=0", &[])?})
        }
        ("PATCH", ["api", "admin", "reports", id]) => {
            admin(&user)?;
            let report=db.get("SELECT * FROM reports WHERE id=?", &[json!(id)])?;
            if report.is_null() { return Err(ApiError::new(404,"Report not found.")); }
            db.transaction(|| {
                if bool_value(&body["hide"]) { db.run("UPDATE quizzes SET visibility='private' WHERE id=?", &[report["quiz_id"].clone()])?; }
                db.run("UPDATE reports SET status='resolved' WHERE id=?", &[json!(id)])?;
                Ok(ok())
            })?
        }
        ("GET", ["api", "grading"]) => {
            let uid=auth(&user)?;
            json!(db.all("SELECT r.*,a.name,q.prompt,q.points FROM responses r JOIN attempts a ON r.attempt_id=a.id JOIN questions q ON q.id=r.question_id JOIN quizzes z ON z.id=a.quiz_id WHERE z.owner=? AND r.earned IS NULL AND a.submitted IS NOT NULL AND a.preview=0", &[uid.clone()])?)
        }
        ("POST", ["api", "grading"]) => {
            let uid=auth(&user)?;
            let r=db.get("SELECT r.*,q.points,z.owner FROM responses r JOIN questions q ON q.id=r.question_id JOIN quizzes z ON z.id=q.quiz_id WHERE r.attempt_id=? AND r.question_id=?", &[body["attempt"].clone(),body["question"].clone()])?;
            let earned=number(&body["earned"]);
            if r.is_null() || &r["owner"]!=uid || !r["earned"].is_null() || !earned.is_finite() || earned<0.0 || earned>number(&r["points"]) { return Err(ApiError::new(400,"Invalid grade.")); }
            db.transaction(|| {
                db.run("UPDATE responses SET earned=? WHERE attempt_id=? AND question_id=?", &[json!(earned),body["attempt"].clone(),body["question"].clone()])?;
                db.run("UPDATE attempts SET score=score+?,pending=pending-1,correct=correct+? WHERE id=?", &[json!(earned),json!(if earned==number(&r["points"]){1}else{0}),body["attempt"].clone()])?;
                Ok(ok())
            })?
        }
        _ => return Err(ApiError::new(404,"API route not found.")),
    };
    Ok(data.into())
}

fn insert_question(db: &Db, id: &Value, position: usize, q: &Value) -> ApiResult<()> {
    let points = number(&q["points"]);
    db.run("INSERT INTO questions(id,quiz_id,position,type,prompt,options,accepted,explanation,points,correct_option) VALUES(?,?,?,?,?,?,?,?,?,?)", &[
        json!(Uuid::new_v4().to_string()),id.clone(),json!(position),q["type"].clone(),json!(text(&q["prompt"])),json!(q["options"].to_string()),json!(q["accepted"].to_string()),json!(text(&q["explanation"])),json!(if points.is_finite() && points!=0.0 {points}else{10.0}),q["correctOption"].clone()])?;
    Ok(())
}

fn validate(q: &Value, publish: bool) -> ApiResult<()> {
    let error = if !q["title"].is_string()
        || text(&q["title"]).trim().is_empty()
        || text(&q["title"]).chars().count() > 140
    {
        Some("A quiz title is required (up to 140 characters).")
    } else if !q["category"].is_string()
        || text(&q["category"]).trim().is_empty()
        || text(&q["category"]).trim().chars().count() > 60
        || text(&q["category"]).chars().any(|c| c.is_ascii_control())
    {
        Some("Enter a category from 1 to 60 characters.")
    } else if !["public", "unlisted", "private"].contains(&text(&q["visibility"])) {
        Some("Choose a valid visibility.")
    } else if !["Easy", "Intermediate", "Advanced"].contains(&text(&q["difficulty"])) {
        Some("Choose a valid difficulty.")
    } else if !(0.0..=180.0).contains(&number(&q["settings"]["time"]))
        || !(0.0..=100.0).contains(&number(&q["settings"]["passing"]))
    {
        Some("Use a time limit from 0 to 180 minutes and passing score from 0 to 100.")
    } else if !q["questions"].is_array() || q["questions"].as_array().unwrap().len() > 100 {
        Some("Use up to 100 questions.")
    } else {
        None
    };
    if let Some(message) = error {
        return Err(ApiError::new(400, message));
    }
    let qs = q["questions"].as_array().unwrap();
    for x in qs {
        if !x["prompt"].is_string()
            || !x["options"]
                .as_array()
                .is_some_and(|a| a.iter().all(Value::is_string))
            || !x["accepted"]
                .as_array()
                .is_some_and(|a| a.iter().all(Value::is_string))
        {
            return Err(ApiError::new(
                400,
                "Questions and answers must contain valid text.",
            ));
        }
    }
    if publish
        && (qs.is_empty()
            || qs.iter().any(|x| {
                let options = x["options"].as_array().unwrap();
                let accepted = x["accepted"].as_array().unwrap();
                let points = number(&x["points"]);
                text(&x["prompt"]).trim().is_empty()
                    || !["multiple", "boolean", "blank", "short"].contains(&text(&x["type"]))
                    || points.fract() != 0.0
                    || !(1.0..=1000.0).contains(&points)
                    || (["multiple", "boolean"].contains(&text(&x["type"]))
                        && (!(2..=8).contains(&options.len())
                            || options.iter().any(|o| text(o).trim().is_empty())
                            || options
                                .iter()
                                .enumerate()
                                .any(|(i, o)| options[..i].contains(o))
                            || !options.contains(&x["accepted"][0])))
                    || (x["type"] != "short"
                        && (accepted.is_empty()
                            || accepted.iter().any(|a| text(a).trim().is_empty())))
            }))
    {
        return Err(ApiError::new(400,"Complete every question, its answer choices, correct answer, and points before publishing."));
    }
    Ok(())
}

fn start(db: &Db, user: &Value, id: &str, body: &Value) -> ApiResult<Value> {
    let q = quiz(db, id)?;
    if !readable(user, &q) {
        return Err(ApiError::new(404, "Quiz not available."));
    }
    let mut parsed = parse_quiz(q.clone());
    let s = parsed["settings"].clone();
    let preview = q["status"] == "draft" || bool_value(&body["preview"]);
    if preview && !owner(user, &q) {
        return Err(ApiError::new(403, "Only the creator can preview."));
    }
    if user.is_null() && !bool_value(&s["guests"]) {
        return Err(ApiError::new(401, "Please sign in to take this quiz."));
    }
    let mut qs = questions(db, &json!(id))?;
    if qs.is_empty() {
        return Err(ApiError::new(
            400,
            "Add questions before previewing this quiz.",
        ));
    }
    if let Some(i) = qs.iter().position(|q| {
        ["multiple", "boolean"].contains(&text(&q["type"]))
            && (q["options"].as_array().unwrap().len() < 2
                || q["options"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .any(|o| text(o).trim().is_empty()))
    }) {
        return Err(ApiError::new(400,format!("Question {} has empty answer choices. Open Edit quiz and enter text for every answer option before starting.",i+1)));
    }
    if bool_value(&s["randomQuestions"]) {
        qs.shuffle(&mut rand::rng());
    }
    let attempt_id = secret();
    let started = now();
    let minutes = number(&s["time"]);
    let deadline = if minutes.is_finite() && minutes > 0.0 {
        json!(started + (minutes * 60000.0) as i64)
    } else {
        Value::Null
    };
    parsed["preview"] = json!(preview);
    let name = if !text(&body["name"]).is_empty() {
        text(&body["name"])
    } else if !user.is_null() {
        text(&user["name"])
    } else {
        "Guest"
    };
    db.run("INSERT INTO attempts(id,quiz_id,user_id,name,started,deadline,question_order,public,preview,quiz_snapshot) VALUES(?,?,?,?,?,?,?,?,?,?)", &[
        json!(attempt_id),json!(id),user["id"].clone(),json!(limit(name,80)),json!(started),deadline.clone(),json!(json!(qs.iter().map(|q|q["id"].clone()).collect::<Vec<_>>()).to_string()),json!(bool_value(&body["public"]) && bool_value(&s["rankings"]) && !preview),json!(preview),json!(parsed.to_string())])?;
    for question in &mut qs {
        if bool_value(&s["randomAnswers"]) {
            question["options"]
                .as_array_mut()
                .unwrap()
                .shuffle(&mut rand::rng());
        }
        let object = question.as_object_mut().unwrap();
        for key in ["accepted", "explanation", "correctOption", "correct_option"] {
            object.remove(key);
        }
    }
    Ok(json!({"id":attempt_id,"started":started,"deadline":deadline,"quiz":parsed,"questions":qs}))
}

fn submit(db: &Db, a: &Value, body: &Value) -> ApiResult<Value> {
    if !a["submitted"].is_null() {
        return result(db, &a["id"]);
    }
    let qs = attempt_questions(db, a)?;
    let expired = expired(a);
    let (mut score, mut correct, mut pending) = (0.0, 0, 0);
    let maximum: f64 = qs.iter().map(|q| number(&q["points"])).sum();
    db.transaction(|| {
        for q in &qs {
            let answer=if expired {db.get("SELECT answer FROM responses WHERE attempt_id=? AND question_id=?", &[a["id"].clone(),q["id"].clone()])?["answer"].clone()}else{body["answers"][text(&q["id"])].clone()};
            let answer=limit(text(&answer),10000); let earned=grade(q,&answer);
            match earned {None=>pending+=1,Some(n)=>{score+=n;if n>0.0{correct+=1;}}}
            db.run("INSERT INTO responses VALUES(?,?,?,?) ON CONFLICT(attempt_id,question_id) DO UPDATE SET answer=excluded.answer,earned=excluded.earned", &[a["id"].clone(),q["id"].clone(),json!(answer),json!(earned)])?;
        }
        db.run("UPDATE attempts SET submitted=?,score=?,maximum=?,correct=?,pending=? WHERE id=?", &[json!(now().min(a["deadline"].as_i64().unwrap_or(i64::MAX))),json!(score),json!(maximum),json!(correct),json!(pending),a["id"].clone()])?;
        result(db,&a["id"])
    })
}

fn result(db: &Db, id: &Value) -> ApiResult<Value> {
    let mut a = db.get("SELECT * FROM attempts WHERE id=?", &[id.clone()])?;
    let quiz: Value =
        serde_json::from_str(text(&a["quiz_snapshot"])).map_err(ApiError::internal)?;
    a["total"] = json!(attempt_questions(db, &a)?.len());
    let mut responses = if bool_value(&quiz["settings"]["showAnswers"]) {
        db.all("SELECT r.*,q.prompt,q.accepted,q.explanation,q.points FROM responses r JOIN questions q ON r.question_id=q.id WHERE attempt_id=?", &[id.clone()])?
    } else {
        vec![]
    };
    for r in &mut responses {
        r["accepted"] = serde_json::from_str(text(&r["accepted"])).map_err(ApiError::internal)?;
    }
    a["responses"] = json!(responses);
    a["quiz"] = quiz;
    Ok(a)
}
