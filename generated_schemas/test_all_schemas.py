"""Sample input test suite for all 10 generated Python schema validators."""
import importlib
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

CASES = [
    (
        "user_profile",
        ['{"Alice",18,true}', '{"Alice",25,}'],
        ['{"Al",18,true}', '{"Alice",17,true}'],
    ),
    (
        "order_invoice",
        ['{"ORD-2048",149.95,"paid"}', '{"ORD-0001",0,"pending"}'],
        ['{"BAD-12",50,"paid"}', '{"ORD-2048",250000,"paid"}'],
    ),
    (
        "server_config",
        ['{"api.local",8080,true}', '{"db.internal",5432,false}'],
        ['{"ab",8080,true}', '{"api.local",70000,true}'],
    ),
    (
        "sensor_reading",
        ['{"SNS-101",22.5,"C"}', '{"SNS-999",-40,"C"}'],
        ['{"BAD-1",22.5,"C"}', '{"SNS-101",200,"C"}'],
    ),
    (
        "semver_release",
        ['{"v1.2.3",42,"stable"}', '{"v2.0.0",1,"beta"}'],
        ['{"v1.2",42,"stable"}', '{"v1.2.3",0,"stable"}'],
    ),
    (
        "jwt_claim",
        ['{"user_42",1795180000,"admin"}', '{"service_acc",1900000000,"viewer"}'],
        ['{"abc",1795180000,"admin"}', '{"user_42",12345,"admin"}'],
    ),
    (
        "product_sku",
        ['{"SKU-AB123",49.99,12}', '{"SKU-XY999",1,0}'],
        ['{"SKU-12345",49.99,12}', '{"SKU-AB123",0,12}'],
    ),
    (
        "geo_point",
        ['{"Seattle",47.61,-122.33}', '{"Origin",0,0}'],
        ['{"X",47.61,-122.33}', '{"Mars",95.0,10.0}'],
    ),
    (
        "http_route",
        ['{"GET","/api/v1/users",2500}', '{"POST","/hooks/deploy",500}'],
        ['{"GET","no_leading_slash",2500}', '{"GET","/api/v1/users",50}'],
    ),
    (
        "booking_slot",
        ['{"BK-4812",4,true}', '{"BK-0009",1,false}'],
        ['{"BK-99",4,true}', '{"BK-4812",25,true}'],
    ),
]


def main() -> None:
    total = 0
    for mod_name, valid_inputs, invalid_inputs in CASES:
        mod = importlib.import_module(mod_name)
        for payload in valid_inputs:
            res = mod.validate_payload(payload)
            assert res["matched"], f"{mod_name} expected VALID for {payload!r}, got {res}"
            total += 1
        for payload in invalid_inputs:
            res = mod.validate_payload(payload)
            assert not res["matched"], f"{mod_name} expected INVALID for {payload!r}, got {res}"
            total += 1
        print(f"PASS {mod_name}.py ({len(valid_inputs)} valid, {len(invalid_inputs)} invalid)")
    print(f"\nAll {total}/{total} sample input tests passed across {len(CASES)} schema files.")


if __name__ == "__main__":
    main()
