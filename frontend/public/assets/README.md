# Image assets

Put these files in this folder (`frontend/public/assets/`). Filenames must match exactly:

| File | Used for |
|---|---|
| `app_character.png` | Mascot on the welcome / login screen (transparent background) |
| `app_icon.png` | Compact logo next to the "Citizens Eye" name |
| `flooding.jpg` | Image for the demo "flood evacuation" feed post |
| `car_crash.jpg` | Image for the demo "van accident" feed post |

Missing files never break the build: the app shows a labelled placeholder instead
(and logs a warning in development) until the file is added.
