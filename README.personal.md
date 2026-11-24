# openGym Personal

Personal build of openGym inspired by the workout rotation and logging flows in Coach and One Gym. It starts with an empty log and a weekly goal of two completed strength workouts. The next routine stays available after you reach the goal. Workout history and routines stay in the current browser profile. Use **Settings → Data & backup** to make or restore a backup. To bring a One Gym routine over, choose **Import from another app** on that page and select the routine CSV.

**Plan → Plan options → Export One Gym routine CSV** downloads the current rotation and other saved routines in One Gym’s nine-column format. Rest days, supersets, warm-ups and progression rules have no matching CSV fields. Use the JSON backup to retain these settings when moving to another openGym installation.

## Draft a rotation with Ollama Cloud

Choose **Plan → Draft with Ollama**. The preset is a 45-minute, full-gym A/B/C rotation with two strength sessions per week, an optional third, and controlled low-impact lower-body work. **Kimi K3.1 Pro** is the default Ollama Cloud model. The optional draft focus can be left blank. Open training preferences for equipment exceptions, model selection, or profile import.

Enter a key from your Ollama account in the app. A session key clears on reload. **Remember on this device** stores an encrypted copy in this browser and asks for its passphrase to unlock it again. Use a dedicated key and remove it from the phone or revoke it at Ollama when needed.

Review the request before sending it. Movement constraints, recovery notes and recent completed sets each require a separate opt-in. The Vercel relay forwards the key and approved training context to Ollama Cloud for the request. The app excludes the key from workout data and backups. Review generated A/B/C routines before saving and add them to an existing rotation in Plan when you are ready. Generation requires the relay and an internet connection. Workout logging and routine file import work on-device.

## Build and run

Use Node.js 24 or later. From the repository root, run:

```sh
npm ci --prefix frontend
npm run build:personal --prefix frontend
npm run preview --prefix frontend
```

From the repository root, run `vercel dev` to start the frontend, API gateway and private Coach together. Run `vercel dev --local` for local testing without linking a Vercel account. Vercel injects the binding at runtime. Vite Preview serves the static app only.

## Deploy from the fork on Vercel

In the Vercel dashboard, connect `poferraz/openGym` and use `main` as the production branch. Set the project Root Directory to the repository root (`.`) so Vercel reads the root `vercel.json`. Keep Fluid Compute enabled and use Node.js 24.x. Leave **Automatically expose System Environment Variables** enabled for the gateway's origin checks and the source revision link. Keep the fork publicly readable so visitors can retrieve the matching AGPL source from Settings → About.

| Service | Access |
| --- | --- |
| `frontend` | Serves the Personal app and its assets. |
| `api` | Receives browser requests at `/api/coach-plan`. It calls `coach` through the runtime `COACH_INTERNAL_URL` binding. |
| `coach` | Private. Validates requests and forwards them to Ollama Cloud using the key entered in the app. |

Vercel fills `COACH_INTERNAL_URL` automatically. The upstream account API and MCP adapter remain available through the self-hosted Docker setup. Upstream attribution and exercise media terms are in [NOTICE.md](NOTICE.md).
