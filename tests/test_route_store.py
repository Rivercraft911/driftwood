import asyncio

from driftwood.services.playback import PlaybackController
from driftwood.services.route_store import RouteStore
from tests.test_playback import FakeDevice, make_route


def test_renamed_file_still_loads_by_list_id(tmp_path):
    store = RouteStore(tmp_path)
    store.save_route(make_route("walk"))
    (tmp_path / "walk.json").rename(tmp_path / "walk (copy).json")

    [meta] = store.list_routes()
    assert meta.id == "walk (copy)" and meta.name == "walk"
    assert store.get_route(meta.id).name == "walk"


def test_unreadable_file_is_listed_not_hidden(tmp_path):
    store = RouteStore(tmp_path)
    store.save_route(make_route("good"))
    (tmp_path / "broken.json").write_text("{not json")

    listed = {m.id: m for m in store.list_routes()}
    assert listed["good"].error is None
    assert listed["broken"].error


def test_route_update_ignored_when_idle():
    async def run():
        pc = PlaybackController(FakeDevice())
        await pc.update_route(make_route())
        assert pc.simulation is None

    asyncio.run(run())
