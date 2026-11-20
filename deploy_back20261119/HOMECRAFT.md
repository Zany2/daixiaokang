# Homecraft source maintenance

## Repository layout

`homecraft/` is a Git subtree imported from `https://github.com/terryHu7/homecraft.git`, branch `main`, using `--squash`. It contains ordinary tracked files, not a submodule or a nested repository. A normal clone of `daixiaokang` includes the complete source.

Commit local changes to `homecraft/` in the parent repository. Preserve `homecraft/LICENSE` and upstream copyright notices. The existing Hexo site and API are independent of this source directory. Importing the source does not deploy the 3D site or add a public URL.

The initial imported upstream revision is `a082be501776808b91a2a7b481e6386961e9990a`. The subtree merge commit records its baseline in the `git-subtree-split` trailer. Keep these commit messages when retaining or merging the integration history. Do not re-import the directory with an ordinary file copy or create another `.git` inside it.

## Configure the upstream remote

Run from the parent repository root (`G:\code\daixiaokang` on this machine):

```powershell
git remote -v
```

The integration configured a local remote named `homecraft-upstream`. Git remotes are local configuration and are not transferred to other clones. In a new clone, add it once if it is missing:

```powershell
git remote add homecraft-upstream https://github.com/terryHu7/homecraft.git
```

Keep `origin` pointing to the personal website repository. Do not change it to the upstream repository.

## Inspect and merge upstream changes

First inspect `git status` and commit or safely stash unfinished work, including staged changes. The subtree command requires a clean tracked worktree and index. Do not discard changes just to satisfy this requirement.

Fetch to inspect upstream changes without changing source files:

```powershell
git fetch homecraft-upstream main
git log --oneline -10 homecraft-upstream/main
```

Merge the latest upstream source when ready:

```powershell
git subtree pull --prefix=homecraft homecraft-upstream main --squash
```

This merges the entire upstream project into `homecraft/`, including templates, examples, tools, configuration, and the engine. It is not a file overwrite. Git merges compatible edits and reports conflicting changes for review. Changes to different lines may still need compatibility testing.

If conflicts occur:

```powershell
git status
# Edit the conflicted files and reconcile local behavior with upstream changes.
git add -- homecraft
git diff --cached --check
git commit
```

Keep the generated subtree merge message and trailers when completing the merge. Stage any conflict resolutions outside `homecraft/` individually if Git reports them. To cancel an unresolved merge, use `git merge --abort` before starting another update.

Validate the result before pushing:

```powershell
node homecraft/tools/check-site.mjs homecraft
```

For executable source changes, also follow the checks in `homecraft/AGENTS.md`. From `homecraft/`, install dependencies when needed, run `python tools/serve.py`, and run `npm.cmd run check` in another terminal. Run `npm.cmd run check:pr` before pushing Homecraft changes, as required by its project instructions. Review the resulting diff and test any local customizations after an update.

## Customization and engine-only releases

Prefer `homecraft/world/`, `homecraft/assets/`, `homecraft/index.html`, `homecraft/home.config.js`, and `homecraft/homecraft.json` for campus content. Minimize engine changes to reduce conflicts.

For an engine-only stable release update, Homecraft provides its official updater. Follow `homecraft/engine/UPDATING.md`; run its commands inside `homecraft/`. The updater preserves site content and handles engine conflicts. It does not advance the full-project subtree baseline; a later subtree merge may still need conflict resolution. Do not run both update workflows concurrently.

## Initial local backup

The original independent clone, including its `.git` and local ignored files, was preserved at `.tmp-homecraft-integration-20261118/upstream-clone/`. The same backup directory contains snapshots of the parent repository's pre-existing changes. The parent `.gitignore` excludes `.tmp-*`, so this backup is not uploaded. Keep it until the integration has been reviewed.
