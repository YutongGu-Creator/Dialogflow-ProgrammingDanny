'use strict';

// The Cloud Functions for Firebase SDK to create Cloud Functions and setup triggers.
const functions = require('firebase-functions');
// The Firebase Admin SDK to access Firestore.
const admin = require('firebase-admin');
admin.initializeApp();
const firestore = admin.firestore();

const { WebhookClient } = require('dialogflow-fulfillment');
const { Payload } = require('dialogflow-fulfillment');
const axios = require('axios');

// enables lib debugging statements
process.env.DEBUG = 'dialogflow:debug';

const PAGE_ACCESS_TOKEN = '';

exports.dialogflowFirebaseFulfillment = functions.https.onRequest((request, response) => {
    //Create an instance
    const agent = new WebhookClient({ request, response });

    const chapterPriority = ["java_basics", "java_flow_control", "java_oop_basics_part1"];
    const sectionPriority = {
        java_basics: ["syntax", "comments", "variable", "data types", "type casting", "operators"],
        java_flow_control: ["scanner", "if", "switch", "while", "for"],
        java_oop_basics_part1: ["method", "create a method", "call a method", "parameter", "overload", "scope", "recursion"],
        java_oop_basics_part2: ["class", "constructor", "Modifiers", "encapsulation", "inheritance", "polymorphism", "inner classes", "abstraction", "interface"],
        error_handling: ["exceptions", "catch exceptions", "throw exceptions"],
        collection: ["ArrayList", "LinkedList", "HashMap", "HashSet", "Iterator"],
        io: ["file handling", "create files", "read files", "delete files"]
    };
    const beginnerQuiz = sectionPriority.java_basics.concat(sectionPriority.java_flow_control);
    const intermediateQuiz = sectionPriority.java_oop_basics_part1.concat(sectionPriority.java_oop_basics_part2);
    const advancedQuiz = sectionPriority.error_handling.concat(sectionPriority.collection.concat(sectionPriority.io));

    //get PSID from request
    const PSID = agent.originalRequest.payload.data.sender.id;
    // https://developers.facebook.com/docs/messenger-platform/identity/user-profile/#fields;
    const url = `https://graph.facebook.com/${PSID}?fields=id,first_name,last_name&access_token=${PAGE_ACCESS_TOKEN}`;

    // For registering new users or welcoming old users
    function welcome(agent) {
        const firstTimePayload = {
            text: 'Would you like to start learning from scratch or answer a few questions so I can try to find your current kowledge level?',
            quick_replies: [
                {
                    content_type: 'text',
                    title: 'Answer questions',
                    payload: 'Answer questions'
                }, {
                    content_type: 'text',
                    title: 'Start new',
                    payload: 'Start new'
                }
            ]
        };

        const useCases = ' Here are the things I can do for you right now: \n \
        1. I can teach you concepts of JAVA language, start by saying something like "teach me". 🧑‍🏫\n \
        2. I can answer questions about JAVA, just ask me something like "what is abstraction". 🙋\n \
        3. If you are not a total bignner, I can ask you a series of quesions to determine your current knwoledge level, just say something like "quiz me". 🤔\n \
        4. If you answered a question incorrect, you can say something like "ask me again quiz I was incorrect" after you learnt the corresponding concept. 👌\n \
        5. I can also do some samll talks with you if you\'re ever bored. 👀';

        return axios.get(url)
            .then(usr => {
                const userRef = firestore.collection('user').doc(usr.data.id);
                return userRef.get()
                    .then(user => {
                        // If user documnet doesn't exsit create a new one
                        if (!user.exists) {
                            writeUser(usr.data);
                            agent.add(`Hello there, ${usr.data.first_name}. 😀`);
                            agent.add(`I noticed this is your first time talking to me.`);
                            agent.add(useCases);
                            // Send quick replies to messenger
                            agent.add(new Payload(agent.FACEBOOK, firstTimePayload, { rawPayload: false, sendAsMessage: true }));
                        } else {
                            agent.add(`Welcome back ${usr.data.first_name}. 😀`);
                            agent.add(useCases);
                        }
                        return Promise.resolve('Read complete');
                    })
                    .catch((err) => {
                        console.log(err);
                        agent.add('error reading userid')
                    });
            })
            .catch(err => {
                console.log(err);
            });
    }

    // For retrieving answer's to users' questionss from the database
    function knowledgeAnswer(agent) {
        // Get what topic the user is looking for
        const knowledge = agent.parameters.java_knowledge;
        const knowledgeRef = firestore.collection('java_knowledge').doc(knowledge);
        return knowledgeRef.get()
            .then(doc => {
                // Print out knowledge to user
                doc.data().description.forEach(d => {
                    if (d.endsWith('.png') || d.endsWith('.jpg')) { // Send as images when ends with .png or .jpg, CAN ONLY SEND ONE payload due to API limitation
                        const imagePayload = {
                            "attachment": {
                                "type": "image",
                                "payload": {
                                    "url": d
                                }
                            }
                        };
                        agent.add(new Payload(agent.FACEBOOK, imagePayload, { rawPayload: false, sendAsMessage: true }));
                    } else {
                        agent.add(d);
                    }
                });
                return axios.get(url)
                    .then(usr => {
                        const userRef = firestore.collection('user').doc(usr.data.id);
                        return userRef.update({ knowledgeAsked: admin.firestore.FieldValue.arrayUnion(knowledge) })
                            .then(() => {
                                return Promise.resolve('complete');
                            })
                            .catch(err => {
                                console.log(err);
                            });
                    })
            })
            .catch((err) => {
                console.log(err);
                agent.add('error knowledgeAnswer')
            });
    }

    // Start teaching from the very start
    function welcomeStartNew(agent) {
        agent.add('We\'ll start from the beginnin, you can say \'start learning\' anytime to start or continue learning.');
    }

    // Give quizees to determine users' knowledge level
    function welcomeAnswerQuestions(agent) {
        agent.add('Please choose your starting difficulties and answer the quizzes using the buttons below.');
        agent.add('a. Beginner');
        agent.add('b. Intermediate');
        agent.add('c. Advanced');
        agent.add('d. I want to start new Instead.');
        const quizPayload = {
            text: 'Choose an answer',
            quick_replies: [
                {
                    content_type: 'text',
                    title: 'a',
                    payload: 'Beginner'
                }, {
                    content_type: 'text',
                    title: 'b',
                    payload: 'Intermediate'
                }, {
                    content_type: 'text',
                    title: 'c',
                    payload: 'Advanced'
                }, {
                    content_type: 'text',
                    title: 'd',
                    payload: 'Start from the most bascis'
                }
            ]
        };
        agent.add(new Payload(agent.FACEBOOK, quizPayload, { rawPayload: false, sendAsMessage: true }));
    }

    // Set quizDifficulty in user database after intention Default Welcome Intent - Answer Questions.
    function setDifficulty(agent) {
        const difficulty = agent.parameters.quiz_difficulty;
        return axios.get(url)
            .then(usr => {
                const userRef = firestore.collection('user').doc(usr.data.id);
                return userRef.update({ quizDifficulty: difficulty })
                    .then(() => {
                        // Ask a random quiz
                        const quizLength = eval(difficulty + 'Quiz').length;
                        const quizIndex = Math.floor(Math.random() * quizLength);
                        const quizNumber = 'q' + quizIndex;
                        const quizRef = firestore.collection('dynamic_quiz').doc(difficulty);
                        return quizRef.get()
                            .then(quiz => {
                                agent.add(quiz.data()[quizNumber].quiz);
                                agent.add(`a. ${quiz.data()[quizNumber].a}`);
                                agent.add(`b. ${quiz.data()[quizNumber].b}`);
                                agent.add(`c. ${quiz.data()[quizNumber].c}`);
                                agent.add(`d. ${quiz.data()[quizNumber].d}`);
                                const quizPayload = quizResolve(quiz.data()[quizNumber].answer, quiz.data()[quizNumber].name);
                                agent.add(new Payload(agent.FACEBOOK, quizPayload, { rawPayload: false, sendAsMessage: true }));
                                return Promise.resolve('complete');
                            })
                            .catch(err => {
                                console.log(err);
                                agent.add('error setDifficulty');
                            });
                    })
                    .catch(err => {
                        console.log(err);
                        agent.add('error setDifficulty');
                    });
            })
            .catch(err => {
                console.log(err);
                agent.add('error setDifficulty');
            });
    }

    // Used for resuming quizzing event
    function quizMe(agent) {
        agent.add('quizMe');
        return axios.get(url)
            .then(usr => {
                const userRef = firestore.collection('user').doc(usr.data.id);
                return userRef.get()
                    .then(user => {
                        // Merge questions recorded
                        const quizzesAsked = user.data().quizRight.concat(user.data().quizWrong);
                        // Get unique elements from certain difficulty array
                        let quizzesNotAsked = eval(user.data().quizDifficulty + 'Quiz').filter(e => !quizzesAsked.includes(e));
                        // Get quiz correct ratio
                        const correctQuiz = eval(user.data().quizDifficulty + 'Quiz').filter(e => user.data().quizRight.includes(e));
                        const correctRate = Math.round((correctQuiz.length / eval(user.data().quizDifficulty + 'Quiz').length) * 100) / 100 * 100;

                        if (correctRate >= 70) {
                            if (quizzesNotAsked.length === 0) {
                                if (user.data().quizDifficulty === 'advanced') {
                                    agent.add('You are very good and have gotten ' + correctRate + '% of all the quizzes correct in the advanced level, congrats.');
                                }
                                else if (user.data().quizDifficulty === 'beginner') {
                                    if (quizzesAsked.filter(e => intermediateQuiz.includes(e)).length != 0) {
                                        agent.add('Looks like you are at the beginner level.');
                                    }
                                    else {
                                        agent.add('You are very good and have gotten ' + correctRate + '% of all the quizzes correct in the beginner level, let\'s go to intermediate level.');
                                        return userRef.update({ quizDifficulty: 'intermediate' })
                                            .then(() => {
                                                // Ask a random quiz of intermediate difficulty
                                                const quizLength = intermediateQuiz.length;
                                                const quizIndex = Math.floor(Math.random() * quizLength);
                                                const quizNumber = 'q' + quizIndex;
                                                const quizRef = firestore.collection('dynamic_quiz').doc('intermediate');
                                                return quizRef.get()
                                                    .then(quiz => {
                                                        agent.add(quiz.data()[quizNumber].quiz);
                                                        agent.add(`a. ${quiz.data()[quizNumber].a}`);
                                                        agent.add(`b. ${quiz.data()[quizNumber].b}`);
                                                        agent.add(`c. ${quiz.data()[quizNumber].c}`);
                                                        agent.add(`d. ${quiz.data()[quizNumber].d}`);
                                                        const quizPayload = quizResolve(quiz.data()[quizNumber].answer, quiz.data()[quizNumber].name);
                                                        agent.add(new Payload(agent.FACEBOOK, quizPayload, { rawPayload: false, sendAsMessage: true }));
                                                        return Promise.resolve('complete');
                                                    })
                                                    .catch(err => {
                                                        console.log(err);
                                                        agent.add('error quizMeCorrect');
                                                    });
                                            })
                                            .catch(err => {
                                                console.log(err);
                                                agent.add('error quizMeCorrect');
                                            });
                                    }
                                }
                                else {
                                    if (quizzesAsked.filter(e => advancedQuiz.includes(e)).length != 0) {
                                        agent.add('Looks like you are at the intermediate level.');
                                    }
                                    else {
                                        agent.add('You are very good and have gotten ' + correctRate + '% of all the quizzes correct in the intermediate level, let\'s go to advanced level.');
                                        return userRef.update({ quizDifficulty: 'advanced' })
                                            .then(() => {
                                                // Ask a random quiz of advancedQuiz difficulty
                                                const quizLength = advancedQuiz.length;
                                                const quizIndex = Math.floor(Math.random() * quizLength);
                                                const quizNumber = 'q' + quizIndex;
                                                const quizRef = firestore.collection('dynamic_quiz').doc('advanced');
                                                return quizRef.get()
                                                    .then(quiz => {
                                                        agent.add(quiz.data()[quizNumber].quiz);
                                                        agent.add(`a. ${quiz.data()[quizNumber].a}`);
                                                        agent.add(`b. ${quiz.data()[quizNumber].b}`);
                                                        agent.add(`c. ${quiz.data()[quizNumber].c}`);
                                                        agent.add(`d. ${quiz.data()[quizNumber].d}`);
                                                        const quizPayload = quizResolve(quiz.data()[quizNumber].answer, quiz.data()[quizNumber].name);
                                                        agent.add(new Payload(agent.FACEBOOK, quizPayload, { rawPayload: false, sendAsMessage: true }));
                                                        return Promise.resolve('complete');
                                                    })
                                                    .catch(err => {
                                                        console.log(err);
                                                        agent.add('error quizMeCorrect');
                                                    });
                                            })
                                            .catch(err => {
                                                console.log(err);
                                                agent.add('error quizMeCorrect');
                                            });
                                    }
                                }
                            }
                            else {
                                if (user.data().quizDifficulty === 'beginner' && quizzesAsked.filter(e => intermediateQuiz.includes(e)).length != 0) {
                                    agent.add('Looks like you are at the beginner level.');
                                }
                                else if (user.data().quizDifficulty === 'intermediate' && quizzesAsked.filter(e => advancedQuiz.includes(e)).length != 0) {
                                    agent.add('Looks like you are at the intermediate level.');
                                } else {
                                    const correctRatePayload = {
                                        text: 'You are pretty good and have gotten ' + correctRate + '% of quizzes correct in this level, would you like to advance to the next level?',
                                        quick_replies: [
                                            {
                                                content_type: 'text',
                                                title: 'yes',
                                                payload: 'yes'
                                            }, {
                                                content_type: 'text',
                                                title: 'no',
                                                payload: 'no'
                                            }
                                        ]
                                    };
                                    agent.add(new Payload(agent.FACEBOOK, correctRatePayload, { rawPayload: false, sendAsMessage: true }));
                                }
                            }
                        }
                        else {
                            if (quizzesNotAsked.length === 0) {
                                if (user.data().quizDifficulty === 'beginner') {
                                    agent.add('Hi you seem like to new to Java , you can ask me to teach you or some Java concept any time.');
                                }
                                else if (user.data().quizDifficulty === 'intermediate') {
                                    if (quizzesAsked.filter(e => beginnerQuiz.includes(e)).length != 0) {
                                        agent.add('Looks like you are at the intermediate level.');
                                    }
                                    else {
                                        agent.add('I\'m sorry you have gotten ' + (100 - correctRate) + '% the quizzes wrong in the intermediate level, let\'s go to beginner level.');
                                        return userRef.update({ quizDifficulty: 'beginner' })
                                            .then(() => {
                                                // Ask a random quiz of beginner difficulty
                                                const quizLength = beginnerQuiz.length;
                                                const quizIndex = Math.floor(Math.random() * quizLength);
                                                const quizNumber = 'q' + quizIndex;
                                                const quizRef = firestore.collection('dynamic_quiz').doc('beginner');
                                                return quizRef.get()
                                                    .then(quiz => {
                                                        agent.add(quiz.data()[quizNumber].quiz);
                                                        agent.add(`a. ${quiz.data()[quizNumber].a}`);
                                                        agent.add(`b. ${quiz.data()[quizNumber].b}`);
                                                        agent.add(`c. ${quiz.data()[quizNumber].c}`);
                                                        agent.add(`d. ${quiz.data()[quizNumber].d}`);
                                                        const quizPayload = quizResolve(quiz.data()[quizNumber].answer, quiz.data()[quizNumber].name);
                                                        agent.add(new Payload(agent.FACEBOOK, quizPayload, { rawPayload: false, sendAsMessage: true }));
                                                        return Promise.resolve('complete');
                                                    })
                                                    .catch(err => {
                                                        console.log(err);
                                                        agent.add('error quizMeCorrect');
                                                    });
                                            })
                                            .catch(err => {
                                                console.log(err);
                                                agent.add('error quizMeCorrect');
                                            });
                                    }
                                }
                                else {
                                    if (quizzesAsked.filter(e => intermediateQuiz.includes(e)).length != 0) {
                                        agent.add('Looks like you are at the advanced level.');
                                    }
                                    else {
                                        agent.add('I\'m sorry you have gotten ' + (100 - correctRate) + '% the quizzes wrong in the advanced level, let\'s go to intermediate level.');
                                        return userRef.update({ quizDifficulty: 'intermediate' })
                                            .then(() => {
                                                // Ask a random quiz of advancedQuiz difficulty
                                                const quizLength = intermediateQuiz.length;
                                                const quizIndex = Math.floor(Math.random() * quizLength);
                                                const quizNumber = 'q' + quizIndex;
                                                const quizRef = firestore.collection('dynamic_quiz').doc('intermediate');
                                                return quizRef.get()
                                                    .then(quiz => {
                                                        agent.add(quiz.data()[quizNumber].quiz);
                                                        agent.add(`a. ${quiz.data()[quizNumber].a}`);
                                                        agent.add(`b. ${quiz.data()[quizNumber].b}`);
                                                        agent.add(`c. ${quiz.data()[quizNumber].c}`);
                                                        agent.add(`d. ${quiz.data()[quizNumber].d}`);
                                                        const quizPayload = quizResolve(quiz.data()[quizNumber].answer, quiz.data()[quizNumber].name);
                                                        agent.add(new Payload(agent.FACEBOOK, quizPayload, { rawPayload: false, sendAsMessage: true }));
                                                        return Promise.resolve('complete');
                                                    })
                                                    .catch(err => {
                                                        console.log(err);
                                                        agent.add('error quizMeCorrect');
                                                    });
                                            })
                                            .catch(err => {
                                                console.log(err);
                                                agent.add('error quizMeCorrect');
                                            });
                                    }
                                }
                            }
                            else {
                                // Ask a random quiz of user's recorded difficulty
                                const quizLength = quizzesNotAsked.length;
                                const quizIndex = Math.floor(Math.random() * quizLength);
                                const quizSelected = quizzesNotAsked[quizIndex];
                                const quizRef = firestore.collection('dynamic_quiz').doc(user.data().quizDifficulty);
                                return quizRef.get()
                                    .then(quiz => {
                                        // Get the length of returned quiz objects
                                        const count = Object.keys(quiz.data()).length;
                                        for (let i = 0; i < count; i++) {
                                            const quizNumber = 'q' + i;
                                            if (quiz.data()[quizNumber].name === quizSelected) {
                                                printQuiz(quiz, quizNumber);
                                            }
                                        }
                                        return Promise.resolve('complete');
                                    })
                                    .catch(err => {
                                        console.log(err);
                                        agent.add('error quizMeCorrect');
                                    });
                            }
                        }
                    })
                    .catch(err => {
                        console.log(err);
                        agent.add('error quizMe');
                    });
            })
            .catch(err => {
                console.log(err);
                agent.add('error quizMe');
            });

    }

    // Update when a user answers a quiz right
    function quizMeCorrect(agent) {
        // agent.add('quizMeCorrect');
        // Get the name of the quiz user answered correct
        const knowledge = agent.parameters.java_knowledge;

        return axios.get(url)
            .then(usr => {
                updateUserChapterCorrect(usr.data.id, knowledge);
                const userRef = firestore.collection('user').doc(usr.data.id);
                return userRef.get()
                    .then(user => {
                        // Merge questions recorded
                        const quizzesAsked = user.data().quizRight.concat(user.data().quizWrong);
                        // Get unique elements from certain difficulty array
                        let quizzesNotAsked = eval(user.data().quizDifficulty + 'Quiz').filter(e => !quizzesAsked.includes(e) && knowledge != e);
                        // Get quiz correct ratio
                        const correctQuiz = eval(user.data().quizDifficulty + 'Quiz').filter(e => user.data().quizRight.includes(e));
                        const correctRate = Math.round(((correctQuiz.length + 1) / eval(user.data().quizDifficulty + 'Quiz').length) * 100) / 100 * 100;

                        if (correctRate >= 70) {
                            if (quizzesNotAsked.length === 0) {
                                if (user.data().quizDifficulty === 'advanced') {
                                    agent.add('You are very good and have gotten ' + correctRate + '% of all the quizzes correct in the advanced level, congrats.');
                                }
                                else if (user.data().quizDifficulty === 'beginner') {
                                    if (quizzesAsked.filter(e => intermediateQuiz.includes(e)).length != 0) {
                                        agent.add('Looks like you are at the beginner level.');
                                    }
                                    else {
                                        agent.add('You are very good and have gotten ' + correctRate + '% of all the quizzes correct in the beginner level, let\'s go to intermediate level.');
                                        return userRef.update({ quizDifficulty: 'intermediate' })
                                            .then(() => {
                                                // Ask a random quiz of intermediate difficulty
                                                const quizLength = intermediateQuiz.length;
                                                const quizIndex = Math.floor(Math.random() * quizLength);
                                                const quizNumber = 'q' + quizIndex;
                                                const quizRef = firestore.collection('dynamic_quiz').doc('intermediate');
                                                return quizRef.get()
                                                    .then(quiz => {
                                                        agent.add(quiz.data()[quizNumber].quiz);
                                                        agent.add(`a. ${quiz.data()[quizNumber].a}`);
                                                        agent.add(`b. ${quiz.data()[quizNumber].b}`);
                                                        agent.add(`c. ${quiz.data()[quizNumber].c}`);
                                                        agent.add(`d. ${quiz.data()[quizNumber].d}`);
                                                        const quizPayload = quizResolve(quiz.data()[quizNumber].answer, quiz.data()[quizNumber].name);
                                                        agent.add(new Payload(agent.FACEBOOK, quizPayload, { rawPayload: false, sendAsMessage: true }));
                                                        return Promise.resolve('complete');
                                                    })
                                                    .catch(err => {
                                                        console.log(err);
                                                        agent.add('error quizMeCorrect');
                                                    });
                                            })
                                            .catch(err => {
                                                console.log(err);
                                                agent.add('error quizMeCorrect');
                                            });
                                    }
                                }
                                else {
                                    if (quizzesAsked.filter(e => advancedQuiz.includes(e)).length != 0) {
                                        agent.add('Looks like you are at the intermediate level.');
                                    }
                                    else {
                                        agent.add('You are very good and have gotten ' + correctRate + '% of all the quizzes correct in the intermediate level, let\'s go to advanced level.');
                                        return userRef.update({ quizDifficulty: 'advanced' })
                                            .then(() => {
                                                // Ask a random quiz of advancedQuiz difficulty
                                                const quizLength = advancedQuiz.length;
                                                const quizIndex = Math.floor(Math.random() * quizLength);
                                                const quizNumber = 'q' + quizIndex;
                                                const quizRef = firestore.collection('dynamic_quiz').doc('advanced');
                                                return quizRef.get()
                                                    .then(quiz => {
                                                        agent.add(quiz.data()[quizNumber].quiz);
                                                        agent.add(`a. ${quiz.data()[quizNumber].a}`);
                                                        agent.add(`b. ${quiz.data()[quizNumber].b}`);
                                                        agent.add(`c. ${quiz.data()[quizNumber].c}`);
                                                        agent.add(`d. ${quiz.data()[quizNumber].d}`);
                                                        const quizPayload = quizResolve(quiz.data()[quizNumber].answer, quiz.data()[quizNumber].name);
                                                        agent.add(new Payload(agent.FACEBOOK, quizPayload, { rawPayload: false, sendAsMessage: true }));
                                                        return Promise.resolve('complete');
                                                    })
                                                    .catch(err => {
                                                        console.log(err);
                                                        agent.add('error quizMeCorrect');
                                                    });
                                            })
                                            .catch(err => {
                                                console.log(err);
                                                agent.add('error quizMeCorrect');
                                            });
                                    }
                                }
                            }
                            else {
                                if (user.data().quizDifficulty === 'beginner' && quizzesAsked.filter(e => intermediateQuiz.includes(e)).length != 0) {
                                    agent.add('Looks like you are at the beginner level.');
                                }
                                else if (user.data().quizDifficulty === 'intermediate' && quizzesAsked.filter(e => advancedQuiz.includes(e)).length != 0) {
                                    agent.add('Looks like you are at the intermediate level.');
                                } else {
                                    const correctRatePayload = {
                                        text: 'You are pretty good and have gotten ' + correctRate + '% of quizzes correct in this level, would you like to advance to the next level?',
                                        quick_replies: [
                                            {
                                                content_type: 'text',
                                                title: 'yes',
                                                payload: 'yes'
                                            }, {
                                                content_type: 'text',
                                                title: 'no',
                                                payload: 'no'
                                            }
                                        ]
                                    };
                                    agent.add(new Payload(agent.FACEBOOK, correctRatePayload, { rawPayload: false, sendAsMessage: true }));
                                }
                            }
                        }
                        else {
                            if (quizzesNotAsked.length === 0) {
                                if (user.data().quizDifficulty === 'beginner') {
                                    agent.add('Hi you seem like to be new to Java, you can ask me to teach you or some Java concept any time.');
                                }
                                else if (user.data().quizDifficulty === 'intermediate') {
                                    if (quizzesAsked.filter(e => beginnerQuiz.includes(e)).length != 0) {
                                        agent.add('Looks like you are at the intermediate level.');
                                    }
                                    else {
                                        agent.add('I\'m sorry you have gotten ' + (100 - correctRate) + '% the quizzes wrong in the intermediate level, let\'s go to beginner level.');
                                        return userRef.update({ quizDifficulty: 'beginner' })
                                            .then(() => {
                                                // Ask a random quiz of beginner difficulty
                                                const quizLength = beginnerQuiz.length;
                                                const quizIndex = Math.floor(Math.random() * quizLength);
                                                const quizNumber = 'q' + quizIndex;
                                                const quizRef = firestore.collection('dynamic_quiz').doc('beginner');
                                                return quizRef.get()
                                                    .then(quiz => {
                                                        agent.add(quiz.data()[quizNumber].quiz);
                                                        agent.add(`a. ${quiz.data()[quizNumber].a}`);
                                                        agent.add(`b. ${quiz.data()[quizNumber].b}`);
                                                        agent.add(`c. ${quiz.data()[quizNumber].c}`);
                                                        agent.add(`d. ${quiz.data()[quizNumber].d}`);
                                                        const quizPayload = quizResolve(quiz.data()[quizNumber].answer, quiz.data()[quizNumber].name);
                                                        agent.add(new Payload(agent.FACEBOOK, quizPayload, { rawPayload: false, sendAsMessage: true }));
                                                        return Promise.resolve('complete');
                                                    })
                                                    .catch(err => {
                                                        console.log(err);
                                                        agent.add('error quizMeCorrect');
                                                    });
                                            })
                                            .catch(err => {
                                                console.log(err);
                                                agent.add('error quizMeCorrect');
                                            });
                                    }
                                }
                                else {
                                    if (quizzesAsked.filter(e => intermediateQuiz.includes(e)).length != 0) {
                                        agent.add('Looks like you are at the advanced level.');
                                    }
                                    else {
                                        agent.add('I\'m sorry you have gotten ' + (100 - correctRate) + '% the quizzes wrong in the advanced level, let\'s go to intermediate level.');
                                        return userRef.update({ quizDifficulty: 'intermediate' })
                                            .then(() => {
                                                // Ask a random quiz of advancedQuiz difficulty
                                                const quizLength = intermediateQuiz.length;
                                                const quizIndex = Math.floor(Math.random() * quizLength);
                                                const quizNumber = 'q' + quizIndex;
                                                const quizRef = firestore.collection('dynamic_quiz').doc('intermediate');
                                                return quizRef.get()
                                                    .then(quiz => {
                                                        agent.add(quiz.data()[quizNumber].quiz);
                                                        agent.add(`a. ${quiz.data()[quizNumber].a}`);
                                                        agent.add(`b. ${quiz.data()[quizNumber].b}`);
                                                        agent.add(`c. ${quiz.data()[quizNumber].c}`);
                                                        agent.add(`d. ${quiz.data()[quizNumber].d}`);
                                                        const quizPayload = quizResolve(quiz.data()[quizNumber].answer, quiz.data()[quizNumber].name);
                                                        agent.add(new Payload(agent.FACEBOOK, quizPayload, { rawPayload: false, sendAsMessage: true }));
                                                        return Promise.resolve('complete');
                                                    })
                                                    .catch(err => {
                                                        console.log(err);
                                                        agent.add('error quizMeCorrect');
                                                    });
                                            })
                                            .catch(err => {
                                                console.log(err);
                                                agent.add('error quizMeCorrect');
                                            });
                                    }
                                }
                            }
                            else {
                                // Ask a random quiz of user's recorded difficulty
                                const quizLength = quizzesNotAsked.length;
                                const quizIndex = Math.floor(Math.random() * quizLength);
                                const quizSelected = quizzesNotAsked[quizIndex];
                                const quizRef = firestore.collection('dynamic_quiz').doc(user.data().quizDifficulty);
                                return quizRef.get()
                                    .then(quiz => {
                                        // Get the length of returned quiz objects
                                        const count = Object.keys(quiz.data()).length;
                                        for (let i = 0; i < count; i++) {
                                            const quizNumber = 'q' + i;
                                            if (quiz.data()[quizNumber].name === quizSelected) {
                                                printQuiz(quiz, quizNumber);
                                            }
                                        }
                                    })
                                    .catch(err => {
                                        console.log(err);
                                        agent.add('error quizMeCorrect');
                                    });
                            }
                        }
                    })
                    .catch(err => {
                        console.log(err);
                        agent.add('error quizMeCorrect');
                    });
            })
            .catch(err => {
                console.log(err);
                agent.add('error quizMeCorrect');
            });
    }

    // Update when a user answers a quiz wrong
    function quizFallback(agent) {
        // agent.add('quizFallback');
        // Get parameter from Dialogflow with the string to add to the database
        const knowledge = agent.parameters.java_knowledge;
        return axios.get(url)
            .then(usr => {
                updateUserChapterIncorrect(usr.data.id, knowledge);
                const userRef = firestore.collection('user').doc(usr.data.id);
                return userRef.get()
                    .then(user => {
                        // Merge questions recorded
                        const quizzesAsked = user.data().quizRight.concat(user.data().quizWrong);
                        // Get unique elements from certain difficulty array
                        let quizzesNotAsked = eval(user.data().quizDifficulty + 'Quiz').filter(e => !quizzesAsked.includes(e) && knowledge != e);
                        // Get quiz incorrect ratio
                        const incorrectQuiz = eval(user.data().quizDifficulty + 'Quiz').filter(e => user.data().quizWrong.includes(e));
                        const incorrectRate = Math.round(((incorrectQuiz.length + 1) / eval(user.data().quizDifficulty + 'Quiz').length) * 100) / 100 * 100;

                        if (incorrectRate > 30) {
                            if (quizzesNotAsked.length === 0) {
                                if (user.data().quizDifficulty === 'beginner') {
                                    agent.add('I\'m sorry you have gotten ' + incorrectRate + '% of all the quizzes wrong in the beginner level, let\'s learn Java basics together.');
                                }
                                else if (user.data().quizDifficulty === 'intermediate') {
                                    if (quizzesAsked.filter(e => beginnerQuiz.includes(e)).length != 0) {
                                        agent.add('Looks like you are at the intermediate level.');
                                    } else {
                                        agent.add('I\'m sorry you have gotten ' + incorrectRate + '% of all the quizzes wrong in the intermediate level, let\'s go to beginner level.');
                                        return userRef.update({ quizDifficulty: 'beginner' })
                                            .then(() => {
                                                // Ask a random quiz of beginner difficulty
                                                const quizLength = beginnerQuiz.length;
                                                const quizIndex = Math.floor(Math.random() * quizLength);
                                                const quizNumber = 'q' + quizIndex;
                                                const quizRef = firestore.collection('dynamic_quiz').doc('beginner');
                                                return quizRef.get()
                                                    .then(quiz => {
                                                        agent.add(quiz.data()[quizNumber].quiz);
                                                        agent.add(`a. ${quiz.data()[quizNumber].a}`);
                                                        agent.add(`b. ${quiz.data()[quizNumber].b}`);
                                                        agent.add(`c. ${quiz.data()[quizNumber].c}`);
                                                        agent.add(`d. ${quiz.data()[quizNumber].d}`);
                                                        const quizPayload = quizResolve(quiz.data()[quizNumber].answer, quiz.data()[quizNumber].name);
                                                        agent.add(new Payload(agent.FACEBOOK, quizPayload, { rawPayload: false, sendAsMessage: true }));
                                                        return Promise.resolve('complete');
                                                    })
                                                    .catch(err => {
                                                        console.log(err);
                                                        agent.add('error quizFallback');
                                                    });
                                            })
                                            .catch(err => {
                                                console.log(err);
                                                agent.add('error quizFallback');
                                            });
                                    }
                                }
                                else {
                                    if (quizzesAsked.filter(e => advancedQuiz.includes(e)).length != 0) {
                                        agent.add('Looks like you are at the advanced level.');
                                    } else {
                                        agent.add('I\'m sorry you have gotten ' + incorrectRate + '% of all the quizzes wrong in the advanced level, let\'s go to intermediate level.');
                                        return userRef.update({ quizDifficulty: 'intermediate' })
                                            .then(() => {
                                                // Ask a random quiz of advancedQuiz difficulty
                                                const quizLength = intermediateQuiz.length;
                                                const quizIndex = Math.floor(Math.random() * quizLength);
                                                const quizNumber = 'q' + quizIndex;
                                                const quizRef = firestore.collection('dynamic_quiz').doc('intermediate');
                                                return quizRef.get()
                                                    .then(quiz => {
                                                        agent.add(quiz.data()[quizNumber].quiz);
                                                        agent.add(`a. ${quiz.data()[quizNumber].a}`);
                                                        agent.add(`b. ${quiz.data()[quizNumber].b}`);
                                                        agent.add(`c. ${quiz.data()[quizNumber].c}`);
                                                        agent.add(`d. ${quiz.data()[quizNumber].d}`);
                                                        const quizPayload = quizResolve(quiz.data()[quizNumber].answer, quiz.data()[quizNumber].name);
                                                        agent.add(new Payload(agent.FACEBOOK, quizPayload, { rawPayload: false, sendAsMessage: true }));
                                                        return Promise.resolve('complete');
                                                    })
                                                    .catch(err => {
                                                        console.log(err);
                                                        agent.add('error quizFallback');
                                                    });
                                            })
                                            .catch(err => {
                                                console.log(err);
                                                agent.add('error quizFallback');
                                            });
                                    }
                                }
                            }
                            else {
                                if (user.data().quizDifficulty === 'intermediate' && quizzesAsked.filter(e => beginnerQuiz.includes(e)).length != 0) {
                                    agent.add('Looks like you are at the intermediate level.');
                                }
                                else if (user.data().quizDifficulty === 'advanced' && quizzesAsked.filter(e => intermediateQuiz.includes(e)).length != 0) {
                                    agent.add('Looks like you are at the advanced level.');
                                }
                                else {
                                    const incorrectRatePayload = {
                                        text: 'It seems like this is too hard for you since you have gotten ' + incorrectRate + '% the quizzes wrong in the advanced level, would you like to answer easier quizzes or continue answer quizzes of this level?',
                                        quick_replies: [
                                            {
                                                content_type: 'text',
                                                title: 'answer easier ones',
                                                payload: 'answer easier ones'
                                            }, {
                                                content_type: 'text',
                                                title: 'continue this level',
                                                payload: 'continue this level'
                                            }
                                        ]
                                    };
                                    agent.add(new Payload(agent.FACEBOOK, incorrectRatePayload, { rawPayload: false, sendAsMessage: true }));
                                }
                            }
                        }
                        else {
                            if (quizzesNotAsked.length === 0) {
                                if (user.data().quizDifficulty === 'advanced') {
                                    agent.add('Congrats, you have passed our quizzes of advanced difficulties.');
                                }
                                else if (user.data().quizDifficulty === 'beginner') {
                                    if (quizzesAsked.filter(e => intermediateQuiz.includes(e)).length != 0) {
                                        agent.add('Looks like you are at the beginner level.');
                                    } else {
                                        agent.add('You are very good and have gotten ' + (100 - incorrectRate) + '% the quizzes correct in the beginner level, let\'s go to intermediate level.');
                                        return userRef.update({ quizDifficulty: 'intermediate' })
                                            .then(() => {
                                                // Ask a random quiz of intermediate difficulty
                                                const quizLength = intermediateQuiz.length;
                                                const quizIndex = Math.floor(Math.random() * quizLength);
                                                const quizNumber = 'q' + quizIndex;
                                                const quizRef = firestore.collection('dynamic_quiz').doc('intermediate');
                                                return quizRef.get()
                                                    .then(quiz => {
                                                        agent.add(quiz.data()[quizNumber].quiz);
                                                        agent.add(`a. ${quiz.data()[quizNumber].a}`);
                                                        agent.add(`b. ${quiz.data()[quizNumber].b}`);
                                                        agent.add(`c. ${quiz.data()[quizNumber].c}`);
                                                        agent.add(`d. ${quiz.data()[quizNumber].d}`);
                                                        const quizPayload = quizResolve(quiz.data()[quizNumber].answer, quiz.data()[quizNumber].name);
                                                        agent.add(new Payload(agent.FACEBOOK, quizPayload, { rawPayload: false, sendAsMessage: true }));
                                                        return Promise.resolve('complete');
                                                    })
                                                    .catch(err => {
                                                        console.log(err);
                                                        agent.add('error quizFallback');
                                                    });
                                            })
                                            .catch(err => {
                                                console.log(err);
                                                agent.add('error quizFallback');
                                            });
                                    }
                                }
                                else {
                                    if (quizzesAsked.filter(e => advancedQuiz.includes(e)).length != 0) {
                                        agent.add('Looks like you are at the intermediate level.');
                                    } else {
                                        agent.add('You are very good and have gotten ' + (100 - incorrectRate) + '% the quizzes correct in the intermediate level, let\'s go to advanced level.');
                                        return userRef.update({ quizDifficulty: 'advanced' })
                                            .then(() => {
                                                // Ask a random quiz of advancedQuiz difficulty
                                                const quizLength = advancedQuiz.length;
                                                const quizIndex = Math.floor(Math.random() * quizLength);
                                                const quizNumber = 'q' + quizIndex;
                                                const quizRef = firestore.collection('dynamic_quiz').doc('advanced');
                                                return quizRef.get()
                                                    .then(quiz => {
                                                        agent.add(quiz.data()[quizNumber].quiz);
                                                        agent.add(`a. ${quiz.data()[quizNumber].a}`);
                                                        agent.add(`b. ${quiz.data()[quizNumber].b}`);
                                                        agent.add(`c. ${quiz.data()[quizNumber].c}`);
                                                        agent.add(`d. ${quiz.data()[quizNumber].d}`);
                                                        const quizPayload = quizResolve(quiz.data()[quizNumber].answer, quiz.data()[quizNumber].name);
                                                        agent.add(new Payload(agent.FACEBOOK, quizPayload, { rawPayload: false, sendAsMessage: true }));
                                                        return Promise.resolve('complete');
                                                    })
                                                    .catch(err => {
                                                        console.log(err);
                                                        agent.add('error quizFallback');
                                                    });
                                            })
                                            .catch(err => {
                                                console.log(err);
                                                agent.add('error quizFallback');
                                            });
                                    }
                                }
                            }
                            else {
                                // Ask a random quiz of user's recorded difficulty
                                const quizLength = quizzesNotAsked.length;
                                const quizIndex = Math.floor(Math.random() * quizLength);
                                const quizSelected = quizzesNotAsked[quizIndex];
                                const quizRef = firestore.collection('dynamic_quiz').doc(user.data().quizDifficulty);
                                return quizRef.get()
                                    .then(quiz => {
                                        // Get the length of returned quiz objects
                                        const count = Object.keys(quiz.data()).length;
                                        for (let i = 0; i < count; i++) {
                                            const quizNumber = 'q' + i;
                                            if (quiz.data()[quizNumber].name === quizSelected) {
                                                printQuiz(quiz, quizNumber);
                                            }
                                        }
                                    })
                                    .catch(err => {
                                        console.log(err);
                                        agent.add('error quizFallback');
                                    });
                            }

                        }
                    })
                    .catch(err => {
                        console.log(err);
                        agent.add('error quizFallback');
                    });
            })
            .catch(err => {
                console.log(err);
                agent.add('error quizFallback');
            });
    }

    // When user chooses to go to the next level when he has 70% of quizzes of his current level correct
    function nextLevelYes(agent) {
        return axios.get(url)
            .then(usr => {
                const userRef = firestore.collection('user').doc(usr.data.id);
                return userRef.get()
                    .then(user => {
                        if (user.data().quizDifficulty === 'advanced') {
                            agent.add('Congrats, you have passed our quizzes of advanced difficulties.');
                        }
                        else if (user.data().quizDifficulty === 'beginner') {
                            agent.add('Let\'s go to intermediate level.');
                            return userRef.update({ quizDifficulty: 'intermediate' })
                                .then(() => {
                                    // Ask a random quiz of intermediate difficulty
                                    const quizLength = intermediateQuiz.length;
                                    const quizIndex = Math.floor(Math.random() * quizLength);
                                    const quizNumber = 'q' + quizIndex;
                                    const quizRef = firestore.collection('dynamic_quiz').doc('intermediate');
                                    return quizRef.get()
                                        .then(quiz => {
                                            agent.add(quiz.data()[quizNumber].quiz);
                                            agent.add(`a. ${quiz.data()[quizNumber].a}`);
                                            agent.add(`b. ${quiz.data()[quizNumber].b}`);
                                            agent.add(`c. ${quiz.data()[quizNumber].c}`);
                                            agent.add(`d. ${quiz.data()[quizNumber].d}`);
                                            const quizPayload = quizResolve(quiz.data()[quizNumber].answer, quiz.data()[quizNumber].name);
                                            agent.add(new Payload(agent.FACEBOOK, quizPayload, { rawPayload: false, sendAsMessage: true }));
                                            return Promise.resolve('complete');
                                        })
                                        .catch(err => {
                                            console.log(err);
                                            agent.add('error nextLevelYes');
                                        });
                                })
                                .catch(err => {
                                    console.log(err);
                                    agent.add('error nextLevelYes');
                                });
                        }
                        else {
                            agent.add('Let\'s go to advanced level.');
                            return userRef.update({ quizDifficulty: 'advanced' })
                                .then(() => {
                                    // Ask a random quiz of advancedQuiz difficulty
                                    const quizLength = advancedQuiz.length;
                                    const quizIndex = Math.floor(Math.random() * quizLength);
                                    const quizNumber = 'q' + quizIndex;
                                    const quizRef = firestore.collection('dynamic_quiz').doc('advanced');
                                    return quizRef.get()
                                        .then(quiz => {
                                            agent.add(quiz.data()[quizNumber].quiz);
                                            agent.add(`a. ${quiz.data()[quizNumber].a}`);
                                            agent.add(`b. ${quiz.data()[quizNumber].b}`);
                                            agent.add(`c. ${quiz.data()[quizNumber].c}`);
                                            agent.add(`d. ${quiz.data()[quizNumber].d}`);
                                            const quizPayload = quizResolve(quiz.data()[quizNumber].answer, quiz.data()[quizNumber].name);
                                            agent.add(new Payload(agent.FACEBOOK, quizPayload, { rawPayload: false, sendAsMessage: true }));
                                            return Promise.resolve('complete');
                                        })
                                        .catch(err => {
                                            console.log(err);
                                            agent.add('error nextLevelYes');
                                        });
                                })
                                .catch(err => {
                                    console.log(err);
                                    agent.add('error nextLevelYes');
                                });
                        }
                    })
                    .catch(err => {
                        console.log(err);
                        agent.add('error nextLevelYes');
                    });
            })
            .catch(err => {
                console.log(err);
                agent.add('error nextLevelYes');
            });
    }

    // When user chooses not to go to the next level when he has 70% of quizzes of his current level correct
    function nextLevelNo(agent) {
        return axios.get(url)
            .then(usr => {
                const userRef = firestore.collection('user').doc(usr.data.id);
                return userRef.get()
                    .then(user => {
                        // Merge questions recorded
                        const quizzesAsked = user.data().quizRight.concat(user.data().quizWrong);
                        // Get unique elements from certain difficulty array
                        let quizzesNotAsked = eval(user.data().quizDifficulty + 'Quiz').filter(e => !quizzesAsked.includes(e));
                        // Ask a random quiz of user's recorded difficulty
                        const quizLength = quizzesNotAsked.length;
                        const quizIndex = Math.floor(Math.random() * quizLength);
                        const quizSelected = quizzesNotAsked[quizIndex];
                        const quizRef = firestore.collection('dynamic_quiz').doc(user.data().quizDifficulty);
                        return quizRef.get()
                            .then(quiz => {
                                // Get the length of returned quiz objects
                                const count = Object.keys(quiz.data()).length;
                                for (let i = 0; i < count; i++) {
                                    const quizNumber = 'q' + i;
                                    if (quiz.data()[quizNumber].name === quizSelected) {
                                        agent.add(quiz.data()[quizNumber].quiz);
                                        agent.add(`a. ${quiz.data()[quizNumber].a}`);
                                        agent.add(`b. ${quiz.data()[quizNumber].b}`);
                                        agent.add(`c. ${quiz.data()[quizNumber].c}`);
                                        agent.add(`d. ${quiz.data()[quizNumber].d}`);
                                        const quizPayload = quizResolve(quiz.data()[quizNumber].answer, quiz.data()[quizNumber].name);
                                        agent.add(new Payload(agent.FACEBOOK, quizPayload, { rawPayload: false, sendAsMessage: true }));
                                    }
                                }
                            })
                            .catch(err => {
                                console.log(err);
                                agent.add('error nextLevelNo');
                            });
                    })
                    .catch(err => {
                        console.log(err);
                        agent.add('error nextLevelNo');
                    });
            })
            .catch(err => {
                console.log(err);
                agent.add('error nextLevelNo');
            });
    }

    // When user chooses to go to the last level when he has 30% of quizzes of his current level incorrect
    function lastLevelYes(agent) {
        return axios.get(url)
            .then(usr => {
                const userRef = firestore.collection('user').doc(usr.data.id);
                return userRef.get()
                    .then(user => {
                        if (user.data().quizDifficulty === 'beginner') {
                            agent.add('Hi you seem to be new to Java, you can ask me to teach you or some Java concept any time.');
                        }
                        else if (user.data().quizDifficulty === 'intermediate') {
                            agent.add('Let\'s go to beginner level.');
                            return userRef.update({ quizDifficulty: 'beginner' })
                                .then(() => {
                                    // Ask a random quiz of beginner difficulty
                                    const quizLength = beginnerQuiz.length;
                                    const quizIndex = Math.floor(Math.random() * quizLength);
                                    const quizNumber = 'q' + quizIndex;
                                    const quizRef = firestore.collection('dynamic_quiz').doc('beginner');
                                    return quizRef.get()
                                        .then(quiz => {
                                            agent.add(quiz.data()[quizNumber].quiz);
                                            agent.add(`a. ${quiz.data()[quizNumber].a}`);
                                            agent.add(`b. ${quiz.data()[quizNumber].b}`);
                                            agent.add(`c. ${quiz.data()[quizNumber].c}`);
                                            agent.add(`d. ${quiz.data()[quizNumber].d}`);
                                            const quizPayload = quizResolve(quiz.data()[quizNumber].answer, quiz.data()[quizNumber].name);
                                            agent.add(new Payload(agent.FACEBOOK, quizPayload, { rawPayload: false, sendAsMessage: true }));
                                            return Promise.resolve('complete');
                                        })
                                        .catch(err => {
                                            console.log(err);
                                            agent.add('error lastLevelYes');
                                        });
                                })
                                .catch(err => {
                                    console.log(err);
                                    agent.add('error lastLevelYes');
                                });
                        }
                        else {
                            agent.add('Let\'s go to intermediate level.');
                            return userRef.update({ quizDifficulty: 'intermediate' })
                                .then(() => {
                                    // Ask a random quiz of intermediateQuiz difficulty
                                    const quizLength = intermediateQuiz.length;
                                    const quizIndex = Math.floor(Math.random() * quizLength);
                                    const quizNumber = 'q' + quizIndex;
                                    const quizRef = firestore.collection('dynamic_quiz').doc('intermediate');
                                    return quizRef.get()
                                        .then(quiz => {
                                            agent.add(quiz.data()[quizNumber].quiz);
                                            agent.add(`a. ${quiz.data()[quizNumber].a}`);
                                            agent.add(`b. ${quiz.data()[quizNumber].b}`);
                                            agent.add(`c. ${quiz.data()[quizNumber].c}`);
                                            agent.add(`d. ${quiz.data()[quizNumber].d}`);
                                            const quizPayload = quizResolve(quiz.data()[quizNumber].answer, quiz.data()[quizNumber].name);
                                            agent.add(new Payload(agent.FACEBOOK, quizPayload, { rawPayload: false, sendAsMessage: true }));
                                            return Promise.resolve('complete');
                                        })
                                        .catch(err => {
                                            console.log(err);
                                            agent.add('error lastLevelYes');
                                        });
                                })
                                .catch(err => {
                                    console.log(err);
                                    agent.add('error lastLevelYes');
                                });
                        }
                    })
                    .catch(err => {
                        console.log(err);
                        agent.add('error lastLevelYes');
                    });
            })
            .catch(err => {
                console.log(err);
                agent.add('error lastLevelYes');
            });
    }

    // Update when a user answers a quiz right
    function updateUserChapterCorrect(id, quiz) {
        const userRef = firestore.collection('user').doc(id);

        return userRef.update({ quizRight: admin.firestore.FieldValue.arrayUnion(quiz) })
            .then(() => {
                return Promise.resolve('complete');
            })
            .catch(err => {
                console.log(err);
            });
    }

    // Update when a user answers a quiz wrong
    function updateUserChapterIncorrect(id, quiz) {
        const userRef = firestore.collection('user').doc(id);

        return userRef.update({ quizWrong: admin.firestore.FieldValue.arrayUnion(quiz) })
            .then(() => {
                return Promise.resolve('complete');
            })
            .catch(err => {
                console.log(err);
            });
    }

    // Set the quick suggestion button payload 
    function quizResolve(answer, knowledgeSection) {
        const quizPayload = {
            text: 'Choose an answer by clicking on one of the buttons below👇',
            quick_replies: [
                {
                    content_type: 'text',
                    title: 'a',
                    payload: 'Quiz Fallback ' + knowledgeSection
                }, {
                    content_type: 'text',
                    title: 'b',
                    payload: 'Quiz Fallback ' + knowledgeSection
                }, {
                    content_type: 'text',
                    title: 'c',
                    payload: 'Quiz Fallback ' + knowledgeSection
                }, {
                    content_type: 'text',
                    title: 'd',
                    payload: 'Quiz Fallback ' + knowledgeSection
                }
            ]
        };

        if (answer === 'a') {
            quizPayload.quick_replies[0].payload = 'correct ' + knowledgeSection;
        } else if (answer === 'b') {
            quizPayload.quick_replies[1].payload = 'correct ' + knowledgeSection;
        } else if (answer === 'c') {
            quizPayload.quick_replies[2].payload = 'correct ' + knowledgeSection;
        } else {
            quizPayload.quick_replies[3].payload = 'correct ' + knowledgeSection;
        }

        return quizPayload;
    }

    // Give user knwoledge in the database in a predefined order
    function startTeaching(agent) {
        const nextButtonPayload = {
            text: 'Please press the next button or type next to continue',
            quick_replies: [
                {
                    content_type: 'text',
                    title: 'next',
                    payload: 'next'
                }
            ]
        };

        return axios.get(url)
            .then(usr => {
                const userRef = firestore.collection('user').doc(usr.data.id);

                return userRef.get()
                    .then(user => {
                        // Get the length of all sectionPriority
                        const count = Object.keys(sectionPriority).length;
                        let allKnowledge = [];
                        for (let i = 0; i < count; i++) {
                            allKnowledge = allKnowledge.concat(sectionPriority[chapterPriority[i]]);
                        }
                        // get rid of correct quizzes and taught knowledge
                        const knowledgeKnown = user.data().quizRight.concat(user.data().knowledgeTaught).concat(user.data().quizAnswerAgainCorrect);
                        const knowledgeToTeach = allKnowledge.filter(e => !knowledgeKnown.includes(e));
                        if (knowledgeToTeach.length === 0) {
                            agent.add('Congrats, you have finished all the knowledge we have to offer for now.');
                        } else {
                            const knowledgeRef = firestore.collection('java_knowledge').doc(knowledgeToTeach[0]);
                            return knowledgeRef.get()
                                .then(doc => {
                                    const updateK = updateKnowledge(usr.data.id, knowledgeToTeach[0]);

                                    // Print out the knowledge
                                    doc.data().description.forEach(d => { agent.add(d) });
                                    agent.add(new Payload(agent.FACEBOOK, nextButtonPayload, { rawPayload: false, sendAsMessage: true }));

                                    return Promise.resolve('complete');
                                })
                                .catch(err => {
                                    console.log(err);
                                    agent.add('error startTeaching')
                                });
                        }
                    })
                    .catch(err => {
                        console.log(err);
                        agent.add('error startTeaching')
                    });
            }).catch(err => {
                console.log(err);
                agent.add('error startTeaching')
            });
    }

    // Update user's knowledge level to the next section each time the startTeaching or nextTeaching intent is triggered 
    function updateKnowledge(id, knowledgeSection) {
        const userRef = firestore.collection('user').doc(id);
        // Update knowledgeTaught array
        return userRef.update({ knowledgeTaught: admin.firestore.FieldValue.arrayUnion(knowledgeSection) })
            .then(() => {
                return Promise.resolve('Complete');
            })
            .catch(err => {
                console.log(err);
            })
    }

    // Write a new user's information to the database
    function writeUser(user) {
        // Set new users' quizDifficulty to the starting level
        user.quizDifficulty = 'easy';
        user.quizRight = [];
        user.quizWrong = [];
        user.knowledgeTaught = [];
        user.knowledgeAsked = [];
        user.quizAnswerAgainCorrect = [];

        // Get the database collection 'user' and create document with user id as name and store
        const userRef = firestore.collection('user').doc(user.id);
        return firestore.runTransaction(t => {
            t.set(userRef, user);
            // Must return a Promise in your transaction()-callback
            return Promise.resolve('Write complete');
        }).catch(err => {
            console.log(err);
        });
    }

    // Asking user a quiz they got wrong before
    function quizAnswerAgain(agent) {
        // agent.add('quizAnswerAgain');
        // Get parameter from Dialogflow with the string to add to the database
        const knowledge = agent.parameters.quiz_difficulty;

        return axios.get(url)
            .then(usr => {
                const userRef = firestore.collection('user').doc(usr.data.id);
                return userRef.get()
                    .then(user => {
                        const quizWrong = user.data().quizWrong;
                        const quizWrongLength = quizWrong.length;

                        if (quizWrongLength === 0) {
                            agent.add('You don\'t have any quiz answered wrong at the moment.👍');
                        }
                        else {
                            if (knowledge === 'beginner') {
                                const quizToAsk = quizWrong.filter(e => beginnerQuiz.includes(e));
                                const quizLength = quizToAsk.length;
                                if (quizLength === 0) {
                                    agent.add('You don\'t have any beginner difficulty quiz answered wrong.');
                                }
                                else {
                                    // Ask a random quiz of beginner difficulty that user got wrong before
                                    const quizIndex = Math.floor(Math.random() * quizLength);
                                    const quizSelected = quizToAsk[quizIndex];

                                    const quizRef = firestore.collection('dynamic_quiz').doc('beginner');
                                    return quizRef.get()
                                        .then(quiz => {
                                            // Get the length of returned quiz objects
                                            const count = Object.keys(quiz.data()).length;
                                            for (let i = 0; i < count; i++) {
                                                const quizNumber = 'q' + i;
                                                if (quiz.data()[quizNumber].name === quizSelected) {
                                                    printQuiz(quiz, quizNumber);
                                                }
                                            }
                                            return Promise.resolve('complete');
                                        })
                                        .catch(err => {
                                            console.log(err);
                                            agent.add('error quizAnswerAgain');
                                        });
                                }
                            }
                            else if (knowledge === 'intermediate') {
                                const quizToAsk = quizWrong.filter(e => intermediateQuiz.includes(e));
                                const quizLength = quizToAsk.length;
                                if (quizLength === 0) {
                                    agent.add('You don\'t have any intermediate difficulty quiz answered wrong.');
                                }
                                else {
                                    // Ask a random quiz of intermediate difficulty that user got wrong before
                                    const quizIndex = Math.floor(Math.random() * quizLength);
                                    const quizSelected = quizToAsk[quizIndex];

                                    const quizRef = firestore.collection('dynamic_quiz').doc('intermediate');
                                    return quizRef.get()
                                        .then(quiz => {
                                            // Get the length of returned quiz objects
                                            const count = Object.keys(quiz.data()).length;
                                            for (let i = 0; i < count; i++) {
                                                const quizNumber = 'q' + i;
                                                if (quiz.data()[quizNumber].name === quizSelected) {
                                                    printQuiz(quiz, quizNumber);
                                                }
                                            }
                                            return Promise.resolve('complete');
                                        })
                                        .catch(err => {
                                            console.log(err);
                                            agent.add('error quizAnswerAgain');
                                        });
                                }
                            }
                            else if (knowledge === 'advanced') {
                                const quizToAsk = quizWrong.filter(e => advancedQuiz.includes(e));
                                const quizLength = quizToAsk.length;
                                if (quizLength === 0) {
                                    agent.add('You don\'t have any advanced difficulty quiz answered wrong.');
                                }
                                else {
                                    // Ask a random quiz of advanced difficulty that user got wrong before
                                    const quizIndex = Math.floor(Math.random() * quizLength);
                                    const quizSelected = quizToAsk[quizIndex];

                                    const quizRef = firestore.collection('dynamic_quiz').doc('advanced');
                                    return quizRef.get()
                                        .then(quiz => {
                                            // Get the length of returned quiz objects
                                            const count = Object.keys(quiz.data()).length;
                                            for (let i = 0; i < count; i++) {
                                                const quizNumber = 'q' + i;
                                                if (quiz.data()[quizNumber].name === quizSelected) {
                                                    printQuiz(quiz, quizNumber);
                                                }
                                            }
                                            return Promise.resolve('complete');
                                        })
                                        .catch(err => {
                                            console.log(err);
                                            agent.add('error quizAnswerAgain');
                                        });
                                }
                            }
                            else {
                                // Ask a random quiz of advanced difficulty that user got wrong before
                                const quizIndex = Math.floor(Math.random() * quizWrongLength);
                                const quizSelected = quizWrong[quizIndex];
                                if (beginnerQuiz.includes(quizSelected)) {
                                    const quizRef = firestore.collection('dynamic_quiz').doc('beginner');
                                    return quizRef.get()
                                        .then(quiz => {
                                            // Get the length of returned quiz objects
                                            const count = Object.keys(quiz.data()).length;
                                            for (let i = 0; i < count; i++) {
                                                const quizNumber = 'q' + i;
                                                if (quiz.data()[quizNumber].name === quizSelected) {
                                                    printQuiz(quiz, quizNumber);
                                                }
                                            }
                                            return Promise.resolve('complete');
                                        })
                                        .catch(err => {
                                            console.log(err);
                                            agent.add('error quizAnswerAgain');
                                        });
                                }
                                else if (intermediateQuiz.includes(quizSelected)) {
                                    const quizRef = firestore.collection('dynamic_quiz').doc('intermediate');
                                    return quizRef.get()
                                        .then(quiz => {
                                            // Get the length of returned quiz objects
                                            const count = Object.keys(quiz.data()).length;
                                            for (let i = 0; i < count; i++) {
                                                const quizNumber = 'q' + i;
                                                if (quiz.data()[quizNumber].name === quizSelected) {
                                                    printQuiz(quiz, quizNumber);
                                                }
                                            }
                                            return Promise.resolve('complete');
                                        })
                                        .catch(err => {
                                            console.log(err);
                                            agent.add('error quizAnswerAgain');
                                        });
                                }
                                else {
                                    const quizRef = firestore.collection('dynamic_quiz').doc('advanced');
                                    return quizRef.get()
                                        .then(quiz => {
                                            // Get the length of returned quiz objects
                                            const count = Object.keys(quiz.data()).length;
                                            for (let i = 0; i < count; i++) {
                                                const quizNumber = 'q' + i;
                                                if (quiz.data()[quizNumber].name === quizSelected) {
                                                    printQuiz(quiz, quizNumber);
                                                }
                                            }
                                            return Promise.resolve('complete');
                                        })
                                        .catch(err => {
                                            console.log(err);
                                            agent.add('error quizAnswerAgain');
                                        });
                                }
                            }
                        }
                    })
                    .catch(err => {
                        console.log(err);
                        agent.add('error quizAnswerAgain');
                    });
            })
            .catch(err => {
                console.log(err);
                agent.add('error quizAnswerAgain');
            });
    }

    // Remove the quiz from user's quizWrong array and add it to quizAnswerAgainCorrect
    function quizAnswerAgainCorrect(agent) {
        const firstTimePayload = {
            text: 'That\'s correct! Would you like to answer another one?',
            quick_replies: [
                {
                    content_type: 'text',
                    title: 'Any question',
                    payload: 'ask me that quiz I got wrong again'
                }, {
                    content_type: 'text',
                    title: 'Beginner difficulty',
                    payload: 'beginner level quiz I was wrong'
                }, {
                    content_type: 'text',
                    title: 'intermediate difficulty',
                    payload: 'intermediate level quiz I was wrong'
                }, {
                    content_type: 'text',
                    title: 'advanced difficulty',
                    payload: 'advanced level quiz I was wrong'
                }
            ]
        };

        // Get the name of the quiz user answered correct
        const quiz = agent.parameters.java_knowledge;

        return axios.get(url)
            .then(usr => {
                const userRef = firestore.collection('user').doc(usr.data.id);
                const batchWrite = firestore.batch();
                batchWrite.update(userRef, { quizAnswerAgainCorrect: admin.firestore.FieldValue.arrayUnion(quiz) });
                batchWrite.update(userRef, { quizWrong: admin.firestore.FieldValue.arrayRemove(quiz) });
                // Remove quiz from quizWrong and add it to quizAnswerAgainCorrect at the same time
                return batchWrite.commit()
                    .then(() => {
                        // Send quick replies to messenger
                        agent.add(new Payload(agent.FACEBOOK, firstTimePayload, { rawPayload: false, sendAsMessage: true }));
                    })
                    .catch(err => {
                        console.log(err);
                        agent.add('error quizAnswerAgainCorrect');
                    });
            })
            .catch(err => {
                console.log(err);
                agent.add('error quizAnswerAgainCorrect');
            });
    }

    // Print out the quizzes for users
    function printQuiz(quiz, quizNumber) {
        agent.add(quiz.data()[quizNumber].quiz);
        agent.add(`a. ${quiz.data()[quizNumber].a}`);
        agent.add(`b. ${quiz.data()[quizNumber].b}`);
        agent.add(`c. ${quiz.data()[quizNumber].c}`);
        agent.add(`d. ${quiz.data()[quizNumber].d}`);
        const quizPayload = quizResolve(quiz.data()[quizNumber].answer, quiz.data()[quizNumber].name);
        agent.add(new Payload(agent.FACEBOOK, quizPayload, { rawPayload: false, sendAsMessage: true }));
    }

    // Run the proper function handler based on the matched Dialogflow intent name
    let intentMap = new Map();
    // intentMap.set('your intent name here', yourFunctionHandler);
    intentMap.set('Default Welcome Intent', welcome);
    intentMap.set('Knowledge Answer', knowledgeAnswer);
    intentMap.set('Default Welcome Intent - Start New', welcomeStartNew);
    intentMap.set('Default Welcome Intent - Answer Questions', welcomeAnswerQuestions);
    intentMap.set('Default Welcome Intent - Answer Questions - Set Difficulty', setDifficulty);
    intentMap.set('Start Teaching', startTeaching);
    intentMap.set('Quiz Fallback', quizFallback);
    intentMap.set('Quiz Me', quizMe);
    intentMap.set('Quiz Me - Correct', quizMeCorrect);
    intentMap.set('Quiz Me - Next Level Yes', nextLevelYes);
    intentMap.set('Quiz Me - Next Level No', nextLevelNo);
    intentMap.set('Quiz Me - Last Level Yes', lastLevelYes);
    intentMap.set('Quiz Answer Again', quizAnswerAgain);
    intentMap.set('Quiz Answer Again - Correct', quizAnswerAgainCorrect);

    agent.handleRequest(intentMap);
});

exports.knowledgeUpload = functions.https.onRequest(async (request, response) => {
    const knowledge = request.body;
    // Add or Update JAVA knowledge in the dataase
    await firestore.collection('java_knowledge').doc(knowledge.name).set(knowledge.content)
        .then(() => {
            response.send("successful")
        })
        .catch((err) => {
            console.log(err)
        });
});

exports.quizUpload = functions.https.onRequest(async (request, response) => {
    const quiz = request.body;
    // Add or Update JAVA chapterPriority in the dataase
    await firestore.collection("quiz").doc(quiz.name).set(quiz.content)
        .then(() => {
            response.send("successful")
        })
        .catch((err) => {
            console.log(err)
        });
});

exports.dynamicQuizUpload = functions.https.onRequest(async (request, response) => {
    const quiz = request.body;
    // Add or Update JAVA chapterPriority in the dataase
    await firestore.collection("dynamic_quiz").doc(quiz.difficulty).set(quiz.content)
        .then(() => {
            response.send("successful")
        })
        .catch((err) => {
            console.log(err)
        });
});