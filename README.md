# New

Projects in this repository:

| Folder / file | What it is | How to run |
|---|---|---|
| `OCTMS_Raimalwara_Q2.html` | Raimalwara OCTMS Q2 checklist (standalone page) | Open the file in a browser |
| `pocket-scanner/` | Pocket PDF Scanner (installable web app / PWA) | Serve the folder, e.g. `cd pocket-scanner && python3 -m http.server 8000`, then open http://localhost:8000 |
| `quantdinger/` | [QuantDinger](https://github.com/OpenByteInc/QuantDinger) v5.6.1: self-hosted AI platform for quant trading research (Apache-2.0), imported from upstream commit `30d6138` | `cd quantdinger && ./install.sh` or `docker compose up -d`. See `quantdinger/README.md` |

`quantdinger/` keeps its original `LICENSE` and `LICENSES/`. It is licensed separately from the rest of this repo.
