import { get, run, db } from "./db.mjs";
const examples = [
  [
    "cosmos",
    "A journey through the cosmos",
    "From our cosmic neighborhood to galaxies far, far away. How well do you know the universe?",
    "Science",
    "Intermediate",
    "space",
    "photo-1462331940025-496dfbfc7564",
    [
      [
        "Which planet has the most prominent ring system?",
        ["Mars", "Saturn", "Venus", "Mercury"],
        "Saturn",
        "Saturn’s rings are made largely of ice and rock.",
      ],
      [
        "What is the closest star to Earth?",
        ["Sirius", "Polaris", "The Sun", "Alpha Centauri"],
        "The Sun",
        "The Sun is about 150 million kilometers from Earth.",
      ],
      [
        "What force keeps planets in orbit?",
        ["Magnetism", "Gravity", "Friction", "Electricity"],
        "Gravity",
        "Gravity attracts objects with mass.",
      ],
      [
        "Which galaxy contains our solar system?",
        ["Andromeda", "Milky Way", "Triangulum", "Whirlpool"],
        "Milky Way",
        "Our solar system is in the Orion Arm of the Milky Way.",
      ],
    ],
  ],
  [
    "world",
    "Around the world, one question at a time",
    "Put your passport away. Your next adventure starts with a question.",
    "General Knowledge",
    "Easy",
    "world",
    "photo-1451187580459-43490279c0fa",
    [
      [
        "What is the capital of Japan?",
        ["Kyoto", "Tokyo", "Osaka", "Nara"],
        "Tokyo",
        "Tokyo became the capital in 1868.",
      ],
      [
        "Which ocean is the largest?",
        ["Atlantic", "Indian", "Pacific", "Arctic"],
        "Pacific",
        "The Pacific covers roughly a third of Earth’s surface.",
      ],
      [
        "Which country is home to the pyramids of Giza?",
        ["Greece", "Mexico", "Egypt", "Peru"],
        "Egypt",
        "Giza is near Cairo, Egypt.",
      ],
    ],
  ],
  [
    "design",
    "Think you know good design?",
    "A fresh perspective on color, typography, and the things we use every day.",
    "Technology",
    "Intermediate",
    "design",
    "photo-1558655146-9f40138edfeb",
    [
      [
        "What does UX stand for?",
        [
          "User experience",
          "Universal export",
          "Unique expression",
          "User extension",
        ],
        "User experience",
        "UX considers the entire experience of using a product.",
      ],
      [
        "Which is a primary color in RGB?",
        ["Yellow", "Purple", "Green", "Orange"],
        "Green",
        "RGB means red, green, and blue.",
      ],
      [
        "What improves text readability?",
        ["Very low contrast", "Consistent spacing", "Tiny fonts", "All caps"],
        "Consistent spacing",
        "Consistent spacing helps people scan and read text.",
      ],
    ],
  ],
  [
    "history",
    "Stories that shaped our world",
    "Travel back in time and discover the moments that changed everything.",
    "History",
    "Intermediate",
    "history",
    "photo-1461360370896-922624d12aa1",
    [
      [
        "In which year did the first Moon landing occur?",
        ["1959", "1969", "1979", "1989"],
        "1969",
        "Apollo 11 landed on the Moon in July 1969.",
      ],
      [
        "Which civilization built the Colosseum?",
        ["Greek", "Roman", "Egyptian", "Mayan"],
        "Roman",
        "The Colosseum opened in Rome in 80 CE.",
      ],
    ],
  ],
  [
    "math",
    "A little math, a lot of magic",
    "Give your brain a workout with satisfying puzzles and clever numbers.",
    "Mathematics",
    "Easy",
    "math",
    "photo-1635070041078-e363dbe005cb",
    [
      ["What is 12 × 8?", ["86", "96", "108", "92"], "96", "12 × 8 = 96."],
      [
        "What is the next prime after 7?",
        ["8", "9", "10", "11"],
        "11",
        "11 has only two positive divisors: 1 and 11.",
      ],
    ],
  ],
  [
    "movies",
    "The ultimate movie night quiz",
    "For the scene quoters, soundtrack lovers, and just-one-more-movie people.",
    "Entertainment",
    "Easy",
    "movies",
    "photo-1489599849927-2ee91cede3ba",
    [
      [
        "Who directed Jurassic Park?",
        [
          "Steven Spielberg",
          "Christopher Nolan",
          "James Cameron",
          "Greta Gerwig",
        ],
        "Steven Spielberg",
        "Jurassic Park was released in 1993.",
      ],
      [
        "Which film features a character named Woody?",
        ["Shrek", "Toy Story", "Frozen", "Cars"],
        "Toy Story",
        "Woody is the cowboy in Pixar’s Toy Story.",
      ],
    ],
  ],
  [
    "nature",
    "The wild side of science",
    "From tiny ecosystems to extraordinary creatures. Let curiosity lead the way.",
    "Science",
    "Easy",
    "nature",
    "photo-1441974231531-c6227db76b6e",
    [
      [
        "What gas do plants absorb during photosynthesis?",
        ["Oxygen", "Carbon dioxide", "Helium", "Hydrogen"],
        "Carbon dioxide",
        "Plants use carbon dioxide and water to produce sugars.",
      ],
      [
        "How many legs does an insect have?",
        ["Four", "Six", "Eight", "Ten"],
        "Six",
        "Insects have three pairs of legs.",
      ],
    ],
  ],
  [
    "learning",
    "How do we learn?",
    "Explore the science of learning, memory, and building better habits.",
    "Education",
    "Easy",
    "education",
    "photo-1503676260728-1c00da094a0b",
    [
      [
        "Which technique supports long-term recall?",
        ["Cramming", "Spaced repetition", "Skipping sleep", "Multitasking"],
        "Spaced repetition",
        "Reviewing information at intervals supports retention.",
      ],
      [
        "Sleep supports memory consolidation.",
        ["True", "False"],
        "True",
        "Sleep helps consolidate newly learned information.",
      ],
    ],
  ],
];
export function seed() {
  for (const [id] of examples)
    run(
      "UPDATE quizzes SET cover=? WHERE id=? AND demo=1",
      `/covers/${id}.jpg`,
      id,
    );
  run(
    "UPDATE quizzes SET title='Around the world, one question at a time' WHERE id='world' AND demo=1",
  );
  if (get("SELECT id FROM quizzes LIMIT 1")) return;
  db.exec("BEGIN");
  try {
    for (const [
      id,
      title,
      description,
      category,
      difficulty,
      theme,
      photo,
      questions,
    ] of examples) {
      run(
        "INSERT INTO quizzes(id,title,description,category,difficulty,theme,cover,status,settings,demo) VALUES(?,?,?,?,?,?,?,?,?,1)",
        id,
        title,
        description,
        category,
        difficulty,
        theme,
        `/covers/${id}.jpg`,
        "published",
        JSON.stringify({
          guests: true,
          review: true,
          showAnswers: true,
          rankings: true,
          passing: 60,
          time: 0,
          randomQuestions: false,
          randomAnswers: false,
          layout: "single",
        }),
      );
      questions.forEach(([prompt, options, answer, explanation], i) =>
        run(
          "INSERT INTO questions(id,quiz_id,position,type,prompt,options,accepted,explanation,points) VALUES(?,?,?,?,?,?,?,?,?)",
          `${id}-${i}`,
          id,
          i,
          options.length === 2 ? "boolean" : "multiple",
          prompt,
          JSON.stringify(options),
          JSON.stringify([answer]),
          explanation,
          10,
        ),
      );
    }
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
