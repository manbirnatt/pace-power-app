/* Pace & Power program data. Edit here to change exercises; the app picks up changes when online. */
(function(){
const PH = [
  {key:"p1", name:"Settle", n:"Settle in", focus:"Learn the lifts with light-to-moderate weights. Finish every session feeling like you could do more."},
  {key:"p1", name:"Settle", n:"Settle in", focus:"Same lifts, slightly heavier. Pay attention to how the knee feels."},
  {key:"p1", name:"Build", n:"Build", focus:"Add 5 lb wherever last week felt easy. This is the busiest week so far."},
  {key:"easy", name:"Easy", n:"Easy week", focus:"Fewer sets, lighter weights. Let your body catch up. Skip Sunday."},
  {key:"p2", name:"Power", n:"Add power", focus:"Heavier main lifts, fewer reps. A power move is added to Mon (step-off and stick) and Fri (kettlebell swing). Ski erg intervals go from moderate to hard. Skip the new moves if the first 4 weeks didn't feel comfortable."},
  {key:"p2", name:"Power", n:"Add power", focus:"Add weight to the main lifts and brace holds. Chops and landmine rotations can go a bit faster now."},
  {key:"p2", name:"Power", n:"Push", focus:"The heaviest week. Take your main lifts to 5 solid sets of 5."},
  {key:"p2", name:"Finish", n:"Finish strong", focus:"Fewer sets, heavy weights. Write down your best weights. They're your starting point for the next block. Skip Sunday."}
];
const DOSE = {
  main:["3×10","3×8","4×8","2×8 · light","4×6","4×5","5×5","3×5 · heavy"],
  acc:["3×12","3×12","3×10","2×12 · light","3×10","3×10","4×10","2×10"],
  care:["2×15","2×15","3×12","2×12","3×12","3×12","3×12","2×12"],
  hold:["3×30 s","3×30 s","3×40 s","2×30 s","3×40 s","3×45 s","3×45 s","2×30 s"],
  brace:["3×20 s/leg","3×30 s/leg","3×30 s/leg","2×20 s/leg","3×30 s/leg · heavier","3×40 s/leg","4×30 s/leg · heavier","2×30 s/leg"],
  rot:["3×10/side","3×10/side","3×12/side","2×10/side","3×10/side","3×12/side","3×12/side","2×10/side"]
};
const REST = {main:"2–3 min",acc:"60–90 s",care:"45 s",hold:"45 s",power:"60 s",brace:"45 s",rot:"45 s",ski:"Built in"};
const NONE = [null,null,null,null];

// n: one name, or a list of versions that alternate by week (8 entries = one per week)
const DAYS = [
 {id:"mon", dow:"Mon", short:"Legs A", title:"Legs A", sub:"Squat & brace", knee:true,
  focus:"Squat strength plus the front-leg brace. The brace hold builds the stiff front leg you land on at delivery, without any impact.",
  items:[
   {t:"power", from:4, n:"Step off a low box, stick on your front leg", d:NONE.concat(["3×4","3×5","4×4","3×3"]), tip:"6–12 in box. Step off, land on your front leg with a soft knee and freeze for 2 s. Skip it if the knee is above 3/10."},
   {t:"main", n:[{"n": "Landmine squat", "tip": "Hold the end of the bar at your chest, feet shoulder-width, and sit straight down between your heels. The bar's angle keeps you upright, which is easy on the knee."}, {"n": "Landmine squat", "tip": "Hold the end of the bar at your chest, feet shoulder-width, and sit straight down between your heels. The bar's angle keeps you upright, which is easy on the knee."}, {"n": "Landmine squat", "tip": "Hold the end of the bar at your chest, feet shoulder-width, and sit straight down between your heels. The bar's angle keeps you upright, which is easy on the knee."}, {"n": "Landmine squat", "tip": "Hold the end of the bar at your chest, feet shoulder-width, and sit straight down between your heels. The bar's angle keeps you upright, which is easy on the knee."}, {"n": "Barbell box squat", "tip": "Box at knee height or a little lower. Sit back to the box, pause for a moment, and drive up. Keep your shins fairly upright."}, {"n": "Barbell box squat", "tip": "Box at knee height or a little lower. Sit back to the box, pause for a moment, and drive up. Keep your shins fairly upright."}, {"n": "Barbell box squat", "tip": "Box at knee height or a little lower. Sit back to the box, pause for a moment, and drive up. Keep your shins fairly upright."}, {"n": "Barbell box squat", "tip": "Box at knee height or a little lower. Sit back to the box, pause for a moment, and drive up. Keep your shins fairly upright."}]},
   {t:"brace", n:["Front-leg brace hold, bodyweight","Front-leg brace hold, bodyweight","Front-leg brace hold, light DBs (15–25 lb)","Front-leg brace hold, bodyweight","Landmine front-leg brace hold","Front-leg brace hold, DBs","Landmine front-leg brace hold","Front-leg brace hold, DBs"], tip:"Stand in your delivery stride. Front leg straight like your bowling brace, but never locked back: squeeze the thigh hard so the kneecap lifts. Weight on the front foot, push the floor away, stay tall. Time is per leg; give the front leg an extra set."},
   {t:"acc", n:[{n:"Barbell Romanian deadlift",tip:"Push your hips back with a slight knee bend until you feel the hamstrings stretch, then stand tall."},{n:"Landmine single-leg RDL",tip:"Reps per leg. Hold the bar end in the opposite hand and hinge on one leg. It trains the hip stability your front leg needs."}]},
   {t:"acc", n:["Reverse lunge, bodyweight","Reverse lunge, bodyweight","DB reverse lunge, light","Reverse lunge, bodyweight","Landmine reverse lunge","DB reverse lunge","Landmine reverse lunge","DB reverse lunge"], tip:"Reps per leg. Step back, not forward. It's easier on the knee."},
   {t:"acc", n:["Seated leg curl","Lying leg curl"]},
   {t:"rot", n:["High-to-low cable chop","Pallof press"], tip:"Hips and chest turn together, arms stay long. Slow and controlled. Reps per side."}
  ]},
 {id:"tue", dow:"Tue", short:"Back", title:"Back & Shoulders", sub:"Bowling arm",
  focus:"The bowling-arm day. A short ski erg block trains the trunk crunch of the delivery. Then lats, landmine pressing and shoulder care.",
  items:[
   {t:"ski", n:"Ski erg intervals", d:["5×10 s moderate","6×10 s moderate","6×12 s moderate","4×10 s easy","6×10 s hard","8×10 s hard","8×12 s hard","5×10 s hard"], tip:"Crunch down over your hips like the delivery, arms straight. 50 s easy between. Total work is only about a minute."},
   {t:"main", n:[{"n": "Lat pulldown", "tip": "Pull the bar to your upper chest. Control it on the way up."}, {"n": "Lat pulldown", "tip": "Pull the bar to your upper chest. Control it on the way up."}, {"n": "Lat pulldown", "tip": "Pull the bar to your upper chest. Control it on the way up."}, {"n": "Lat pulldown", "tip": "Pull the bar to your upper chest. Control it on the way up."}, {"n": "Pull-up (band-assisted if needed)", "tip": "Start from a full hang and pull your chin over the bar. Use a band if you can't get all the reps."}, {"n": "Pull-up (band-assisted if needed)", "tip": "Start from a full hang and pull your chin over the bar. Use a band if you can't get all the reps."}, {"n": "Pull-up (band-assisted if needed)", "tip": "Start from a full hang and pull your chin over the bar. Use a band if you can't get all the reps."}, {"n": "Pull-up (band-assisted if needed)", "tip": "Start from a full hang and pull your chin over the bar. Use a band if you can't get all the reps."}]},
   {t:"acc", n:["Half-kneeling landmine press","Split-stance landmine press"], tip:"Reps per arm. Ribs down. The landmine angle is kind to the shoulder."},
   {t:"acc", n:["Landmine T-bar row","Seated cable row"]},
   {t:"acc", n:"Straight-arm cable pulldown", tip:"Arms long, pull the bar down to your thighs. This is the lat pull that brings the bowling arm through."},
   {t:"care", n:"Face pull", tip:"Pull to your forehead, elbows high, squeeze for 1 s."},
   {t:"care", n:["Cable external rotation, elbow at side","Side-lying DB external rotation"], tip:"Very light. Rotator cuff work. Do both arms."}
  ]},
 {id:"wed", dow:"Wed", short:"Off", off:true, title:"Rest day", sub:"Walk & stretch"},
 {id:"thu", dow:"Thu", short:"Chest", title:"Chest & Arms", sub:"Bench",
  focus:"Bench press day. Chest, triceps and biceps for upper-body size.",
  items:[
   {t:"main", n:"Bench press", tip:"Shoulder blades squeezed together, feet flat, bar to the lower chest."},
   {t:"acc", n:["Incline DB press","Low-incline DB press"]},
   {t:"acc", n:["One-arm DB row","Meadows row (landmine)"], tip:"Reps per arm. Balances all the pressing."},
   {t:"acc", n:["Rope triceps pushdown","EZ-bar skull crusher"]},
   {t:"acc", n:["DB curl","Hammer curl"]},
   {t:"care", n:"Face pull", tip:"Second face-pull day. Keeps the shoulders healthy with all the pressing."}
  ]},
 {id:"fri", dow:"Fri", short:"Legs B", title:"Legs B", sub:"Deadlift & brace", knee:true,
  focus:"Hip strength and front-leg control. Slow step-downs teach the front leg to absorb force. Adductor and calf work support the landing.",
  items:[
   {t:"power", from:4, n:"Kettlebell swing", d:NONE.concat(["3×10","3×10","4×10","3×8"]), tip:"Push your hips back, then snap them forward. The arms just hang on."},
   {t:"main", n:["Trap bar deadlift (high handles)","Trap bar deadlift (high handles)","Trap bar deadlift (high handles)","Trap bar deadlift (high handles)","Trap bar deadlift","Trap bar deadlift","Trap bar deadlift","Trap bar deadlift"], tip:"Stand in the middle, flat back, push the floor away."},
   {t:"brace", n:[{n:"Slow step-down from a low box",tip:"Start with a 4–6 in box. Take 3 seconds to lower your heel to the floor, knee tracking over your toes, then step back up."},{n:"Landmine split squat, front-leg focus",tip:"Hold the bar end at your chest in a split stance. Take 3 seconds to lower, keeping most of your weight on the front foot."}], d:["3×6/leg","3×8/leg","3×8/leg","2×6/leg","3×8/leg","3×10/leg","4×8/leg","2×8/leg"]},
   {t:"acc", n:["Hip thrust on a bench","Glute bridge (barbell or DB)"], tip:"Squeeze the glutes at the top for 1 second."},
   {t:"acc", n:[{n:"Copenhagen plank, knee on bench",d:"3×15–20 s/side"},{n:"Side-lying adductor raise",d:"3×12/side"}], tip:"Inner-thigh strength keeps the front leg from caving in on landing."},
   {t:"acc", n:["Standing calf raise","Single-leg calf raise"]},
   {t:"rot", n:["Landmine rotation, slow","Half-kneeling cable chop"], tip:"Turn from the hips, keep the arms long. Controlled now, faster from week 5. Reps per side."}
  ]},
 {id:"sat", dow:"Sat", short:"Upper", title:"Upper Body", sub:"Size",
  focus:"Moderate weights, more reps. This day is about muscle size.",
  items:[
   {t:"acc", n:["Machine chest press","Flat DB press"]},
   {t:"acc", n:["Close-grip lat pulldown","Single-arm landmine row"]},
   {t:"acc", n:["DB lateral raise","Cable lateral raise"], tip:"Builds shoulder width. Light weight, no swinging."},
   {t:"acc", n:["EZ-bar curl","Incline DB curl"]},
   {t:"acc", n:["Overhead cable triceps extension","Assisted dip"]},
   {t:"acc", n:[{n:"Farmer carry",d:"3×30 m"},{n:"DB shrug"}], tip:"Grip strength also helps your hold on the ball."}
  ]},
 {id:"sun", dow:"Sun", short:"Easy", optional:true, title:"Optional", sub:"Easy movement"}
];

window.PROGRAM = {version:"2026-09-28.1", PH:PH, DOSE:DOSE, REST:REST, DAYS:DAYS};
})();
