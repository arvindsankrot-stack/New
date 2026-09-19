"""
Minimal in-memory stand-in for the supabase-py client's fluent query builder,
just enough surface (select/eq/in_/order/limit/execute/upsert/insert/update)
to unit test service-layer logic without a live Supabase project.
"""

from dataclasses import dataclass, field


@dataclass
class _Result:
    data: list[dict] = field(default_factory=list)
    count: int | None = None


class _QueryBuilder:
    def __init__(self, table: "FakeTable", operation: str, payload=None):
        self.table = table
        self.operation = operation
        self.payload = payload
        self.filters: list[tuple[str, str, object]] = []
        self.order_by = None
        self.order_desc = False
        self._limit = None

    def eq(self, field, value):
        self.filters.append(("eq", field, value))
        return self

    def in_(self, field, values):
        self.filters.append(("in", field, values))
        return self

    def select(self, *_args, **_kwargs):
        return self

    def order(self, field, desc=False):
        self.order_by = field
        self.order_desc = desc
        return self

    def limit(self, n):
        self._limit = n
        return self

    def _matches(self, row):
        for kind, field, value in self.filters:
            if kind == "eq" and row.get(field) != value:
                return False
            if kind == "in" and row.get(field) not in value:
                return False
        return True

    def execute(self):
        if self.operation == "select":
            rows = [r for r in self.table.rows if self._matches(r)]
            if self.order_by:
                rows.sort(key=lambda r: r[self.order_by], reverse=self.order_desc)
            if self._limit:
                rows = rows[: self._limit]
            return _Result(data=rows, count=len(rows))

        if self.operation == "insert":
            payload = self.payload if isinstance(self.payload, list) else [self.payload]
            inserted = []
            for row in payload:
                row = {**row, "id": row.get("id") or self.table.next_id()}
                self.table.rows.append(row)
                inserted.append(row)
            return _Result(data=inserted)

        if self.operation == "upsert":
            payload = self.payload if isinstance(self.payload, list) else [self.payload]
            upserted = []
            for row in payload:
                existing = next((r for r in self.table.rows if self._matches({**r})), None)
                if existing:
                    existing.update(row)
                    upserted.append(existing)
                else:
                    row = {**row, "id": row.get("id") or self.table.next_id()}
                    self.table.rows.append(row)
                    upserted.append(row)
            return _Result(data=upserted)

        if self.operation == "update":
            updated = []
            for row in self.table.rows:
                if self._matches(row):
                    row.update(self.payload)
                    updated.append(row)
            return _Result(data=updated)

        raise NotImplementedError(self.operation)

    def upsert(self, payload, on_conflict=None, ignore_duplicates=False):
        self.operation = "upsert"
        self.payload = payload
        return self


class FakeTable:
    def __init__(self, name: str):
        self.name = name
        self.rows: list[dict] = []
        self._id_counter = 0

    def next_id(self) -> str:
        self._id_counter += 1
        return f"{self.name}-{self._id_counter}"

    def select(self, *args, **kwargs):
        return _QueryBuilder(self, "select")

    def insert(self, payload):
        return _QueryBuilder(self, "insert", payload)

    def update(self, payload):
        return _QueryBuilder(self, "update", payload)

    def upsert(self, payload, on_conflict=None, ignore_duplicates=False):
        return _QueryBuilder(self, "upsert", payload)


class FakeSupabaseClient:
    def __init__(self):
        self._tables: dict[str, FakeTable] = {}

    def table(self, name: str) -> FakeTable:
        if name not in self._tables:
            self._tables[name] = FakeTable(name)
        return self._tables[name]
