from app.services.categorizer import categorize_vendor, normalize_vendor_name


def test_categorize_known_streaming_vendor():
    assert categorize_vendor("NETFLIX.COM 866-579-7172") == "streaming"


def test_categorize_known_saas_vendor():
    assert categorize_vendor("GITHUB, INC.") == "saas"


def test_categorize_unknown_vendor_defaults_to_other():
    assert categorize_vendor("Joe's Corner Diner") == "other"


def test_normalize_vendor_strips_processor_prefix_and_domain():
    assert normalize_vendor_name("SQ *NETFLIX.COM") == "netflix"


def test_normalize_vendor_strips_reference_codes():
    assert normalize_vendor_name("SPOTIFY USA 88293471") == "spotify usa"
