# Design and review notes

Working notes from building the crop database, ranking, Step-2 filter and user-added crops.
They record why decisions were made at the time. Where they disagree with the code, the code and
`docs/crop-data-sources.md` win. In particular, the review follow-ups (October 2026) changed:

- winter scoring from chill hours to chill portions (see `docs/crop-data-sources.md`, "Scoring model"),
- the Step-2 filter from hiding crops to showing them under "Struggles here",
- summer heat from scored (placeholder limits) to reported but unscored.
