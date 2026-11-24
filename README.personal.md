# openGym Personal

Personal, browser-only build of openGym inspired by the workout rotation and logging flows in Coach and One Gym. It starts with an empty log. Workout history and routines stay in the current browser profile. Use **Settings → Data & backup** to make or restore a backup. To bring a One Gym routine over, choose **Import from another app** on that page and select the routine CSV.

## Build and run

Use Node.js 24 or later. From the repository root, run:

```sh
npm ci --prefix frontend
npm run build:personal --prefix frontend
npm run preview --prefix frontend
```

## Deploy from the fork on Vercel

Import the GitHub fork as a new Vercel project. Set the root directory to `frontend` and enable **Include source files outside of the Root Directory in the Build Step**. The exercise catalog and shared code are in the parent repository. Set Node.js to 24.x and select the branch that contains the personal build. `frontend/vercel.json` configures the build and output. The Vercel Git metadata identifies the exact source revision linked in Settings → About. Keep the fork publicly readable so visitors can retrieve the matching AGPL source.

The web build uses the upstream workout logger, exercise library, rotation, progression, stats and JSON backups. Accounts, server sync, community sharing and AI chat require services outside this build. Upstream attribution and exercise media terms are in [NOTICE.md](NOTICE.md).
