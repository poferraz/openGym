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

Use `vercel dev` from the configured frontend project for local testing of the generation endpoint. Vite Preview serves the static app only.

## Deploy from the fork on Vercel

In the Vercel dashboard, import `poferraz/openGym` from GitHub and use `main` as the production branch. Set the root directory to `frontend` and enable **Include files outside the root directory in the Build Step**. The exercise catalog and shared code are in the parent repository. Choose Node.js 24.x and leave **Automatically expose System Environment Variables** enabled for the relay and the source revision link. `frontend/vercel.json` sets the Vite framework, build command, output directory, and relay duration. Keep the fork publicly readable so visitors can retrieve the matching AGPL source from Settings → About.

The web build uses the upstream workout logger, exercise library, rotation, progression, stats and JSON backups. Vercel runs the single `api/coach-plan.js` relay. It uses the key entered on the phone, so there is no shared Ollama credential to configure. Upstream attribution and exercise media terms are in [NOTICE.md](NOTICE.md).
