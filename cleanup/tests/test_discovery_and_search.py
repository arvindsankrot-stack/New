from app.db import GmailAccount, Seed, SiteAccount
from app.services import gmail, search
from app.crypto import encrypt_str


def test_extract_username():
    assert gmail.extract_username("Welcome to Reddit", "Your username is cool_cat99. Enjoy!") == "cool_cat99"
    assert gmail.extract_username("Welcome, darkstar!", "") == "darkstar"
    assert gmail.extract_username("Hi there, verify your email", "Hi there, please verify") == ""


def test_sender_domain():
    assert gmail.sender_domain('"Quora" <noreply@mail.quora.com>') == "quora.com"
    assert gmail.sender_domain("Flipkart <no-reply@flipkart.co.in>") == "flipkart.co.in"


def test_record_signup_dedupes(db):
    acct = GmailAccount(email="me@example.com", token_enc=encrypt_str("{}"))
    db.add(acct)
    db.commit()
    seen = set()
    headers = {"from": "Reddit <noreply@redditmail.com>", "subject": "Welcome to Reddit, u/oldname!"}
    assert gmail.record_signup(db, acct, headers, "", seen) == 1
    assert gmail.record_signup(db, acct, headers, "", seen) == 0
    sa = db.query(SiteAccount).one()
    assert sa.site_domain == "redditmail.com"
    # mailbox providers ignored
    assert gmail.record_signup(db, acct, {"from": "x@gmail.com", "subject": "welcome"}, "", seen) == 0


def test_phone_query_variants():
    qs = search.queries_for_seed(Seed(kind="phone", value="+91 98765 43210"))
    assert '"9876543210"' in qs and '"+91 9876543210"' in qs and '"98765 43210"' in qs


def test_username_queries_include_reddit():
    qs = search.queries_for_seed(Seed(kind="username", value="oldname"))
    assert 'site:reddit.com "oldname"' in qs


def test_save_hits_dedupes(db):
    hits = [search.Hit(url="https://example.com/a", title="A", source="brave"),
            search.Hit(url="https://example.com/a", title="A again", source="brave"),
            search.Hit(url="javascript:alert(1)", source="brave")]
    assert search.save_hits(db, hits) == 1
