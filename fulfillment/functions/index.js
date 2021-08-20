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

const PAGE_ACCESS_TOKEN = 'EAAeepkZBvyvcBAK0FykKKuoMNImq4TERgBQQ4szxJdkerwRm2dbzxfz2LkVEpd5aZBJP2bPZCHm7euybNU6BIQSEgdSE3UvEtIgOJoMtZBXfb6lFevoxa8Tmn22WzNigw8o8Yt31XZB0qeDZB2nnCmPBSt0wQC6SieBVONidk0N5TsFkwZBjCKy';

exports.dialogflowFirebaseFulfillment = functions.https.onRequest((request, response) => {
    //Create an instance
    const agent = new WebhookClient({ request, response });

    const sectionPriority = {
        java_basics: ["syntax", "comments", "variable", "data types", "type casting", "operators"],
        java_flow_control: ["scanner", "if", "switch", "while", "for"],
        java_oop_basics_part1: ["method", "create a method", "call a method", "parameter", "overload", "scope", "recursion"],
        java_oop_basics_part2: ["class", "constructor", "modifier", "encapsulation", "inheritance", "polymorphism", "inner classes", "abstraction", "interface"],
        error_handling: ["exceptions", "catch exceptions", "throw exceptions"],
        collection: ["ArrayList", "LinkedList", "HashMap", "HashSet", "Iterator"],
        io: ["file handling", "create files", "read files", "delete files"]
    };
    const beginnerQuiz = sectionPriority.java_basics.concat(sectionPriority.java_flow_control);
    const intermediateQuiz = sectionPriority.java_oop_basics_part1.concat(sectionPriority.java_oop_basics_part2);
    const advancedQuiz = sectionPriority.error_handling.concat(sectionPriority.collection.concat(sectionPriority.io));
    const allQuizzes = beginnerQuiz.concat(intermediateQuiz.concat(advancedQuiz));

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
        1. I can *teach you* concepts of JAVA language. 🧑‍🏫\n \
        2. I can *answer questions* about JAVA. 🙋\n \
        3. If you are not a total beginner, I can *ask you a series of quesions* to find out what you already know. 🤔\n \
        4. You can *answer incorrect quizzes again* after you learnt that concept. 👌\n \
        5. You can ask about what I think your *current knowledge level* is at any time. 🔍\n \
        6. I can also do some *small talks* with you if you\'re ever bored. 👀';

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
                            agent.add('You can find all the source code for this project here: https://github.com/YutongGu-Creator/Dialogflow-ProgrammingDanny')
                            // Send quick replies to messenger
                            agent.add(new Payload(agent.FACEBOOK, firstTimePayload, { rawPayload: false, sendAsMessage: true }));
                        } else {
                            agent.add(`Welcome back ${usr.data.first_name}. 😀`);
                            agent.add(useCases);
                            agent.add('You can find all the source code for this project here: https://github.com/YutongGu-Creator/Dialogflow-ProgrammingDanny')
                        }
                        return Promise.resolve('Read complete');
                    })
                    .catch((err) => {
                        console.log(err);
                        agent.add('error welcome')
                    });
            })
            .catch(err => {
                console.log(err);
                agent.add('error welcome')
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
                    sendImageORText(d);
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
        agent.add('We\'ll start from the beginnin, you can say things like \'start learning\' anytime to start or continue learning.');
    }

    // Give quizees to determine users' knowledge level
    function welcomeAnswerQuestions(agent) {
        agent.add('When answering a quiz please choose from one of the quick suggestions that pops up instead if typing.')
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
        // agent.add('quizMe');
        agent.add('When answering a quiz please choose from one of the quick suggestions that pops up instead if typing.')
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

    // When user chooses not to go to the next level when he has 70% of quizzes of his current level correct or 30% incorrect
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

    // Give user knwoledge in the database in a predefined order
    function startTeaching(agent) {
        return axios.get(url)
            .then(usr => {
                const userRef = firestore.collection('user').doc(usr.data.id);

                return userRef.get()
                    .then(user => {
                        // All knowledge sections excluding correct quizzes and taught knowledge
                        const knowledgeKnown = user.data().quizRight.concat(user.data().knowledgeTaught).concat(user.data().quizAnswerAgainCorrect);
                        const knowledgeToTeach = allQuizzes.filter(e => !knowledgeKnown.includes(e));
                        if (knowledgeToTeach.length === 0) {
                            agent.add('Congrats, you have finished all the knowledge we have to offer for now.');
                        } else {
                            const knowledgeRef = firestore.collection('java_knowledge').doc(knowledgeToTeach[0]);
                            return knowledgeRef.get()
                                .then(doc => {
                                    // Records the concept as taught
                                    updateKnowledge(usr.data.id, knowledgeToTeach[0]);

                                    const description = doc.data().description;
                                    const descriptionLength = description.length;
                                    // Print out the concept, last sentence is sent with a quick suggestion button
                                    for (let i in description) {
                                        if (i < descriptionLength - 1) {
                                            agent.add(description[i]);
                                        } else {
                                            const nextButtonPayload = {
                                                text: description[i],
                                                quick_replies: [
                                                    {
                                                        content_type: 'text',
                                                        title: 'next',
                                                        payload: 'next'
                                                    }
                                                ]
                                            };
                                            agent.add(new Payload(agent.FACEBOOK, nextButtonPayload, { rawPayload: false, sendAsMessage: true }));
                                        }
                                    }
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

    function sendImageORText(description) {
        if (description.endsWith('.png') || description.endsWith('.jpg')) {
            const imagePayload = {
                "attachment": {
                    "type": "image",
                    "payload": {
                        "url": description
                    }
                }
            };
            return agent.add(new Payload(agent.FACEBOOK, imagePayload, { rawPayload: false, sendAsMessage: true }));
        } else {
            return agent.add(description);
        }
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

    // Show user all the quizzes they've been asked
    function quizAsked(agent) {
        return axios.get(url)
            .then(usr => {
                const userRef = firestore.collection('user').doc(usr.data.id);
                return userRef.get()
                    .then(user => {
                        const qAskedArr = user.data().quizRight.concat(user.data().quizWrong.concat(user.data().quizAnswerAgainCorrect));
                        if (qAskedArr.length === 0) {
                            agent.add('No quiz have been asked, to start say "quiz me"');
                        } else {
                            agent.add("Here are the quizzes that you have been asked.");
                            let qAskedBeginner = ' ';
                            let qAskedBeginnerArr = qAskedArr.filter(e => beginnerQuiz.includes(e));
                            qAskedBeginnerArr.forEach(q => {
                                qAskedBeginner += '"' + q + '" ';
                            });
                            agent.add("*Beginner Difficulty Quizzes:* " + qAskedBeginner);
                            let qAskedIntermediate = ' ';
                            let qAskedIntermediateArr = qAskedArr.filter(e => intermediateQuiz.includes(e));
                            qAskedIntermediateArr.forEach(q => {
                                qAskedIntermediate += '"' + q + '" ';
                            });
                            agent.add("*Intermediate Difficulty Quizzes:* " + qAskedIntermediate);
                            let qAskedAdvanced = ' ';
                            let qAskedAdvancedArr = qAskedArr.filter(e => advancedQuiz.includes(e));
                            qAskedAdvancedArr.forEach(q => {
                                qAskedAdvanced += '"' + q + '" ';
                            });
                            agent.add("*Advanced Difficulty Quizzes:* " + qAskedAdvanced);
                        }
                    })
                    .catch(err => {
                        console.log(err);
                        agent.add('error quizAsked');
                    });
            })
            .catch(err => {
                console.log(err);
                agent.add('error quizAsked');
            });
    }

    // Show user all the quizzes they've not been asked
    function quizUnasked(agent) {
        // agent.add('quizUnasked');
        return axios.get(url)
            .then(usr => {
                const userRef = firestore.collection('user').doc(usr.data.id);
                return userRef.get()
                    .then(user => {
                        const qAskedArr = user.data().quizRight.concat(user.data().quizWrong.concat(user.data().quizAnswerAgainCorrect));
                        const qUnaskedArr = allQuizzes.filter(e => !qAskedArr.includes(e));
                        if (qUnaskedArr.length === 0) {
                            agent.add('All quizzes have been asked.');
                        } else {
                            agent.add("Here are the quizzes that you have not been asked.");
                            let qAskedBeginner = ' ';
                            let qAskedBeginnerArr = qUnaskedArr.filter(e => beginnerQuiz.includes(e));
                            qAskedBeginnerArr.forEach(q => {
                                qAskedBeginner += '"' + q + '" ';
                            });
                            agent.add("*Beginner Difficulty Quizzes:* " + qAskedBeginner);
                            let qAskedIntermediate = ' ';
                            let qAskedIntermediateArr = qUnaskedArr.filter(e => intermediateQuiz.includes(e));
                            qAskedIntermediateArr.forEach(q => {
                                qAskedIntermediate += '"' + q + '" ';
                            });
                            agent.add("*Intermediate Difficulty Quizzes:* " + qAskedIntermediate);
                            let qAskedAdvanced = ' ';
                            let qAskedAdvancedArr = qUnaskedArr.filter(e => advancedQuiz.includes(e));
                            qAskedAdvancedArr.forEach(q => {
                                qAskedAdvanced += '"' + q + '" ';
                            });
                            agent.add("*Advanced Difficulty Quizzes:* " + qAskedAdvanced);
                        }
                    })
                    .catch(err => {
                        console.log(err);
                        agent.add('error quizUnasked');
                    });
            })
            .catch(err => {
                console.log(err);
                agent.add('error quizUnasked');
            });
    }

    // Show user all the quizzes they were right about
    function showQuizCorrect(agent) {
        // agent.add('showQuizCorrect');
        return axios.get(url)
            .then(usr => {
                const userRef = firestore.collection('user').doc(usr.data.id);
                return userRef.get()
                    .then(user => {
                        const qAskedCorrectArr = user.data().quizRight;
                        if (qAskedCorrectArr.length === 0) {
                            agent.add('Sorry you have no record of correct quizzes.');
                        } else {
                            agent.add("Here are the quizzes that you were correct about the first time.");
                            let qAskedBeginner = ' ';
                            let qAskedBeginnerArr = qAskedCorrectArr.filter(e => beginnerQuiz.includes(e));
                            qAskedBeginnerArr.forEach(q => {
                                qAskedBeginner += '"' + q + '" ';
                            });
                            if (qAskedBeginner != ' ')
                                agent.add("*Beginner Difficulty Quizzes:* " + qAskedBeginner);
                            let qAskedIntermediate = ' ';
                            let qAskedIntermediateArr = qAskedCorrectArr.filter(e => intermediateQuiz.includes(e));
                            qAskedIntermediateArr.forEach(q => {
                                qAskedIntermediate += '"' + q + '" ';
                            });
                            if (qAskedIntermediate != ' ')
                                agent.add("*Intermediate Difficulty Quizzes:* " + qAskedIntermediate);
                            let qAskedAdvanced = ' ';
                            let qAskedAdvancedArr = qAskedCorrectArr.filter(e => advancedQuiz.includes(e));
                            qAskedAdvancedArr.forEach(q => {
                                qAskedAdvanced += '"' + q + '" ';
                            });
                            if (qAskedAdvanced != ' ')
                                agent.add("*Advanced Difficulty Quizzes:* " + qAskedAdvanced);
                        }
                        const qAskedAgainCorrectArr = user.data().quizAnswerAgainCorrect;
                        if (qAskedAgainCorrectArr.length != 0) {
                            agent.add("Here are the quizzes that you were correct after answering them again.");
                            let qAskedBeginner = ' ';
                            let qAskedBeginnerArr = qAskedAgainCorrectArr.filter(e => beginnerQuiz.includes(e));
                            qAskedBeginnerArr.forEach(q => {
                                qAskedBeginner += '"' + q + '" ';
                            });
                            if (qAskedBeginner != ' ')
                                agent.add("*Beginner Difficulty Quizzes:* " + qAskedBeginner);
                            let qAskedIntermediate = ' ';
                            let qAskedIntermediateArr = qAskedAgainCorrectArr.filter(e => intermediateQuiz.includes(e));
                            qAskedIntermediateArr.forEach(q => {
                                qAskedIntermediate += '"' + q + '" ';
                            });
                            if (qAskedIntermediate != ' ')
                                agent.add("*Intermediate Difficulty Quizzes:* " + qAskedIntermediate);
                            let qAskedAdvanced = ' ';
                            let qAskedAdvancedArr = qAskedAgainCorrectArr.filter(e => advancedQuiz.includes(e));
                            qAskedAdvancedArr.forEach(q => {
                                qAskedAdvanced += '"' + q + '" ';
                            });
                            if (qAskedAdvanced != ' ')
                                agent.add("*Advanced Difficulty Quizzes:* " + qAskedAdvanced);
                        }
                    })
                    .catch(err => {
                        console.log(err);
                        agent.add('error showQuizCorrect');
                    });
            })
            .catch(err => {
                console.log(err);
                agent.add('error showQuizCorrect');
            });
    }

    // Show user all the quizzes they were wrong about
    function showQuizIncorrect(agent) {
        // agent.add('showQuizIncorrect');
        return axios.get(url)
            .then(usr => {
                const userRef = firestore.collection('user').doc(usr.data.id);
                return userRef.get()
                    .then(user => {
                        const qAskedIncorrectArr = user.data().quizWrong;
                        if (qAskedIncorrectArr.length === 0) {
                            agent.add('Sorry you have no record of incorrect quizzes.');
                        } else {
                            agent.add("Here are the quizzes that you were wrong about.");
                            let qAskedBeginner = ' ';
                            let qAskedBeginnerArr = qAskedIncorrectArr.filter(e => beginnerQuiz.includes(e));
                            qAskedBeginnerArr.forEach(q => {
                                qAskedBeginner += '"' + q + '" ';
                            });
                            if (qAskedBeginner != ' ')
                                agent.add("*Beginner Difficulty Quizzes:* " + qAskedBeginner);
                            let qAskedIntermediate = ' ';
                            let qAskedIntermediateArr = qAskedIncorrectArr.filter(e => intermediateQuiz.includes(e));
                            qAskedIntermediateArr.forEach(q => {
                                qAskedIntermediate += '"' + q + '" ';
                            });
                            if (qAskedIntermediate != ' ')
                                agent.add("*Intermediate Difficulty Quizzes:* " + qAskedIntermediate);
                            let qAskedAdvanced = ' ';
                            let qAskedAdvancedArr = qAskedIncorrectArr.filter(e => advancedQuiz.includes(e));
                            qAskedAdvancedArr.forEach(q => {
                                qAskedAdvanced += '"' + q + '" ';
                            });
                            if (qAskedAdvanced != ' ')
                                agent.add("*Advanced Difficulty Quizzes:* " + qAskedAdvanced);
                        }
                        const qAskedAgainCorrectArr = user.data().quizAnswerAgainCorrect;
                        if (qAskedAgainCorrectArr.length != 0) {
                            agent.add("Here are the quizzes that you were correct after answering them again.");
                            let qAskedBeginner = ' ';
                            let qAskedBeginnerArr = qAskedAgainCorrectArr.filter(e => beginnerQuiz.includes(e));
                            qAskedBeginnerArr.forEach(q => {
                                qAskedBeginner += '"' + q + '" ';
                            });
                            if (qAskedBeginner != ' ')
                                agent.add("*Beginner Difficulty Quizzes:* " + qAskedBeginner);
                            let qAskedIntermediate = ' ';
                            let qAskedIntermediateArr = qAskedAgainCorrectArr.filter(e => intermediateQuiz.includes(e));
                            qAskedIntermediateArr.forEach(q => {
                                qAskedIntermediate += '"' + q + '" ';
                            });
                            if (qAskedIntermediate != ' ')
                                agent.add("*Intermediate Difficulty Quizzes:* " + qAskedIntermediate);
                            let qAskedAdvanced = ' ';
                            let qAskedAdvancedArr = qAskedAgainCorrectArr.filter(e => advancedQuiz.includes(e));
                            qAskedAdvancedArr.forEach(q => {
                                qAskedAdvanced += '"' + q + '" ';
                            });
                            if (qAskedAdvanced != ' ')
                                agent.add("*Advanced Difficulty Quizzes:* " + qAskedAdvanced);
                        }
                    })
                    .catch(err => {
                        console.log(err);
                        agent.add('error showQuizIncorrect');
                    });
            })
            .catch(err => {
                console.log(err);
                agent.add('error showQuizIncorrect');
            });
    }

    // Show user all the concepts they've been taught
    function knowledgeTaught(agent) {
        // agent.add('knowledegeTaught');
        return axios.get(url)
            .then(usr => {
                const userRef = firestore.collection('user').doc(usr.data.id);
                return userRef.get()
                    .then(user => {
                        const knowledgeTaughtArr = user.data().knowledgeTaught;
                        if (knowledgeTaughtArr.length === 0) {
                            agent.add('Hi it seems I have not taught you anything yet.');
                        } else {
                            agent.add("Here are the Java concepts I have taught you.");
                            let knowledgeTaughtBeginner = ' ';
                            let knowledgeTaughtBeginnerArr = knowledgeTaughtArr.filter(e => beginnerQuiz.includes(e));
                            knowledgeTaughtBeginnerArr.forEach(q => {
                                knowledgeTaughtBeginner += '"' + q + '" ';
                            });
                            agent.add("*Beginner Difficulty Knowledge:* " + knowledgeTaughtBeginner);

                            let knowledgeTaughtIntermediate = ' ';
                            let knowledgeTaughtIntermediateArr = knowledgeTaughtArr.filter(e => intermediateQuiz.includes(e));
                            knowledgeTaughtIntermediateArr.forEach(q => {
                                knowledgeTaughtIntermediate += '"' + q + '" ';
                            });
                            agent.add("*Intermediate Difficulty Knowledge:* " + knowledgeTaughtIntermediate);

                            let knowledgeTaughtAdvanced = ' ';
                            let knowledgeTaughtAdvancedArr = knowledgeTaughtArr.filter(e => advancedQuiz.includes(e));
                            knowledgeTaughtAdvancedArr.forEach(q => {
                                knowledgeTaughtAdvanced += '"' + q + '" ';
                            });
                            agent.add("*Advanced Difficulty Knowledge:* " + knowledgeTaughtAdvanced);
                        }
                    })
                    .catch(err => {
                        console.log(err);
                        agent.add('error knowledegeTaught');
                    });
            })
            .catch(err => {
                console.log(err);
                agent.add('error knowledegeTaught');
            });
    }

    // Show user all the concepts they've not been taught
    function knowledgeUntaught(agent) {
        // agent.add('knowledegeUntaught');
        return axios.get(url)
            .then(usr => {
                const userRef = firestore.collection('user').doc(usr.data.id);
                return userRef.get()
                    .then(user => {
                        const knowledgeTaughtArr = user.data().knowledgeTaught;
                        const allQuizzes = beginnerQuiz.concat(intermediateQuiz.concat(advancedQuiz));
                        const untaughtArr = allQuizzes.filter(e => !knowledgeTaughtArr.includes(e));
                        if (untaughtArr.length === 0) {
                            agent.add('Hi I have taught you everything I know right now.');
                        } else {
                            agent.add("Here are the Java concepts I have not taught you.");
                            let knowledgeTaughtBeginner = ' ';
                            let knowledgeTaughtBeginnerArr = untaughtArr.filter(e => beginnerQuiz.includes(e));
                            knowledgeTaughtBeginnerArr.forEach(q => {
                                knowledgeTaughtBeginner += '"' + q + '" ';
                            });
                            agent.add("*Beginner Difficulty Knowledge:* " + knowledgeTaughtBeginner);

                            let knowledgeTaughtIntermediate = ' ';
                            let knowledgeTaughtIntermediateArr = untaughtArr.filter(e => intermediateQuiz.includes(e));
                            knowledgeTaughtIntermediateArr.forEach(q => {
                                knowledgeTaughtIntermediate += '"' + q + '" ';
                            });
                            agent.add("*Intermediate Difficulty Knowledge:* " + knowledgeTaughtIntermediate);

                            let knowledgeTaughtAdvanced = ' ';
                            let knowledgeTaughtAdvancedArr = untaughtArr.filter(e => advancedQuiz.includes(e));
                            knowledgeTaughtAdvancedArr.forEach(q => {
                                knowledgeTaughtAdvanced += '"' + q + '" ';
                            });
                            agent.add("*Advanced Difficulty Knowledge:* " + knowledgeTaughtAdvanced);
                        }
                    })
                    .catch(err => {
                        console.log(err);
                        agent.add('error knowledgeUntaught');
                    });
            })
            .catch(err => {
                console.log(err);
                agent.add('error knowledgeUntaught');
            });
    }

    // Show user all the concepts the bot can teach
    function showAllKnowledge(agent) {
        // agent.add('showAllKnowledge');
        agent.add("Here are all the Java concepts I can teach you.");
        let knowledgeBeginner = ' ';
        beginnerQuiz.forEach(q => { knowledgeBeginner += '"' + q + '" '; })
        agent.add("*Beginner Difficulty Knowledge:* " + knowledgeBeginner);
        let knowledgeIntermediate = ' ';
        intermediateQuiz.forEach(q => { knowledgeIntermediate += '"' + q + '" '; })
        agent.add("*Intermediate Difficulty Knowledge:* " + knowledgeIntermediate);
        let knowledgeAdvanced = ' ';
        advancedQuiz.forEach(q => { knowledgeAdvanced += '"' + q + '" '; })
        agent.add("*Advanced Difficulty Knowledge:* " + knowledgeAdvanced);
    }

    // Show user what their currect knowledge level is based on the most difficult concept they have been taught
    function showCurrentLevel(agent) {
        // agent.add('showCurrentLevel');
        const showOptions = '1.I can show you a list of all the Java concepts I can teach.\n2.I can show you the concepts I have taught you.\n3.I can show you the concepts I have *not* taught you.\n4.I can show you the quizzes I have given you.\n5.I can show you the quizzes I have *not* given you.\n6.I can show you the quizzes you were *right* about.\n7.I can show you the quizzes you were *wrong* about.';
        return axios.get(url)
            .then(usr => {
                const userRef = firestore.collection('user').doc(usr.data.id);
                return userRef.get()
                    .then(user => {
                        if ((user.data().knowledgeTaught).length === 0) {
                            agent.add(`It look like you are at *${user.data().quizDifficulty}* level`);
                        }
                        else {
                            const mostDifficultConceptTaught = user.data().knowledgeTaught[user.data().knowledgeTaught.length - 1];
                            if (beginnerQuiz.includes(mostDifficultConceptTaught)) {
                                agent.add('It look like you are at *beginner* level, here are several things you can do:');
                                agent.add(showOptions);
                            }
                            else if (intermediateQuiz.includes(mostDifficultConceptTaught)) {
                                agent.add('It look like you are at *intermediate* level, here are several things you can do:');
                                agent.add(showOptions);
                            }
                            else {
                                agent.add('It look like you are at *advanced* level, here are several things you can do:');
                                agent.add(showOptions);
                            }
                        }
                    })
                    .catch(err => {
                        console.log(err);
                        agent.add('error showCurrentLevel');
                    });
            })
            .catch(err => {
                console.log(err);
                agent.add('error showCurrentLevel');
            });
    }

    // Give user a google search link when asked knowledge does not exsit in the current database 
    function giveGoogleSuggestion(again) {
        // Get what topic the user is looking for
        const knowledge = agent.parameters.any;
        agent.add(`I don't know about ${knowledge} yet, but here's a link for its google search result:`);
        agent.add(`www.google.com/search?q=${knowledge}`);
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
        user.quizDifficulty = 'beginner';
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
    intentMap.set('Show Quiz Asked', quizAsked);
    intentMap.set('Show Quiz Unasked', quizUnasked);
    intentMap.set('Show Knowledge Taught', knowledgeTaught);
    intentMap.set('Show Knowledge Untaught', knowledgeUntaught);
    intentMap.set('Show All Knowledge', showAllKnowledge);
    intentMap.set('Show Current Level', showCurrentLevel);
    intentMap.set('Show Quiz Correct', showQuizCorrect);
    intentMap.set('Show Quiz Incorrect', showQuizIncorrect);
    intentMap.set('Give Google Suggestion', giveGoogleSuggestion);

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

