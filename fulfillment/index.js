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

    const chapterPriority = ['java_basics', 'java_flow_control', 'java_oop_basics_part1'];
    const sectionPriority = {
        java_basics: ['syntax', 'comments', 'variable', 'data types', 'type casting', 'operators'],
        java_flow_control: ['scanner', 'if', 'switch', 'while', 'for'],
        java_oop_basics_part1: ["method", "create a method", "call a method", "parameter", "overload", "scope"]
    };
    const beginnerQuiz = sectionPriority.java_basics;
    const intermediateQuiz = sectionPriority.java_flow_control;
    const advancedQuiz = sectionPriority.java_oop_basics_part1;

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

        return axios.get(url)
            .then(user => {
                const userRef = firestore.collection('user').doc(user.data.id);
                return userRef.get()
                    .then(doc => {
                        // If user documnet doesn't exsit create a new one
                        if (!doc.exists) {
                            writeUser(user.data);
                            agent.add(`Hello there, ${user.data.first_name}.`);
                            agent.add(`I noticed this is your first time talking to me.`);
                            // Send quick replies to messenger
                            agent.add(new Payload(agent.FACEBOOK, firstTimePayload, { rawPayload: false, sendAsMessage: true }));
                        } else {
                            agent.add(`Welcome back ${user.data.first_name}.`);
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
        // Get the correlated database collection
        const java_basics = ['syntax', 'comments', 'variable', 'data types', 'type casting', 'operators'];
        const java_flow_control = ['scanner', 'if', 'switch', 'while', 'for'];
        const java_oop_basics_part1 = ['method', 'create a method', 'call a method', 'parameter', 'overload', "scope"];
        let collectionName;
        if (java_basics.includes(knowledge)) {
            collectionName = 'java_basics';
        } else if (java_oop_basics_part1.includes(knowledge)) {
            collectionName = 'java_oop_basics_part1';
        }
        else {
            collectionName = 'java_flow_control';
        }
        const knowledgeRef = firestore.collection(collectionName).doc(knowledge);
        return knowledgeRef.get()
            .then(doc => {
                doc.data().description.forEach(d => { agent.add(d) });
                return Promise.resolve('Read complete');
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
                                    agent.add('Congrats, you have passed our quizzes of advanced difficulties.');
                                }
                                else if (user.data().quizDifficulty === 'beginner') {
                                    if (quizzesAsked.filter(e => intermediateQuiz.includes(e)).length != 0) {
                                        agent.add('Looks like you are at the beginner level.');
                                    }
                                    else {
                                        agent.add('You are very good and have gotten ' + correctRate + '% the quizzes correct in the beginner level, let\'s go to intermediate level.');
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
                                        agent.add('You are very good and have gotten ' + correctRate + '% the quizzes correct in the intermediate level, let\'s go to advanced level.');
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
                        else {
                            if (quizzesNotAsked.length === 0) {
                                if (user.data().quizDifficulty === 'beginner') {
                                    agent.add('Hi you seem like to be a newbie, you can ask me to teach you or some Java concept any time.');
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
        agent.add('quizMeCorrect');
        // Get parameter from Dialogflow with the string to add to the database
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
                                    agent.add('Congrats, you have passed our quizzes of advanced difficulties.');
                                }
                                else if (user.data().quizDifficulty === 'beginner') {
                                    if (quizzesAsked.filter(e => intermediateQuiz.includes(e)).length != 0) {
                                        agent.add('Looks like you are at the beginner level.');
                                    }
                                    else {
                                        agent.add('You are very good and have gotten ' + correctRate + '% the quizzes correct in the beginner level, let\'s go to intermediate level.');
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
                                        agent.add('You are very good and have gotten ' + correctRate + '% the quizzes correct in the intermediate level, let\'s go to advanced level.');
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
                        else {
                            if (quizzesNotAsked.length === 0) {
                                if (user.data().quizDifficulty === 'beginner') {
                                    agent.add('Hi you seem like to be a newbie, you can ask me to teach you or some Java concept any time.');
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
        agent.add('quizFallback');
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
                                    agent.add('Hi you seem like to be a newbie, you can ask me to teach you or some Java concept any time.');
                                }
                                else if (user.data().quizDifficulty === 'intermediate') {
                                    if (quizzesAsked.filter(e => beginnerQuiz.includes(e)).length != 0) {
                                        agent.add('Looks like you are at the intermediate level.');
                                    } else {
                                        agent.add('I\'m sorry you have gotten ' + incorrectRate + '% the quizzes wrong in the intermediate level, let\'s go to beginner level.');
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
                                        agent.add('I\'m sorry you have gotten ' + incorrectRate + '% the quizzes wrong in the advanced level, let\'s go to intermediate level.');
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
                            agent.add('Hi you seem like to be a newbie, you can ask me to teach you or some Java concept any time.');
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
            text: 'Choose an answer',
            quick_replies: [
                {
                    content_type: 'text',
                    title: 'a',
                    payload: 'incorrect ' + knowledgeSection
                }, {
                    content_type: 'text',
                    title: 'b',
                    payload: 'incorrect ' + knowledgeSection
                }, {
                    content_type: 'text',
                    title: 'c',
                    payload: 'incorrect ' + knowledgeSection
                }, {
                    content_type: 'text',
                    title: 'd',
                    payload: 'incorrect ' + knowledgeSection
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
            .then(user => {
                const userRef = firestore.collection('user').doc(user.data.id);

                return userRef.get()
                    .then(usr => {
                        const knowledgeRef = firestore.collection(usr.data().knowledgeChapter).doc(usr.data().knowledgeSection);
                        return knowledgeRef.get()
                            .then(doc => {
                                const updateK = updateKnowledge(user.data.id, usr.data().knowledgeChapter, usr.data().knowledgeSection);
                                if (updateK === ('finished')) {
                                    agent.add('Congrats, you have finished all the knowledge we have to offer for now.');
                                } else {
                                    doc.data().description.forEach(d => { agent.add(d) });
                                    agent.add(new Payload(agent.FACEBOOK, nextButtonPayload, { rawPayload: false, sendAsMessage: true }));
                                }
                                return Promise.resolve('complete');
                            })
                            .catch(err => {
                                console.log(err);
                                agent.add('error startTeaching')
                            });
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

    // Write a new user's information to the database
    function writeUser(user) {
        // Set new users' quizDifficulty to the starting level
        user.quizDifficulty = 'easy';
        user.quizRight = [];
        user.quizWrong = [];

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

    // Update user's knowledge level to the next section each time the startTeaching or nextTeaching intent is triggered 
    function updateKnowledge(id, knowledgeChapter, knowledgeSection) {
        const userRef = firestore.collection('user').doc(id);

        // Update chapterPriority and sectionPriority when changes are made to them in the database 
        const knowledgeSectionIndex = sectionPriority[knowledgeChapter].indexOf(knowledgeSection) + 1;

        if (knowledgeSectionIndex == sectionPriority[knowledgeChapter].length) {
            const knowledgeChapterIndex = chapterPriority.indexOf(knowledgeChapter) + 1;
            // When the user has reached the end section of the chapter
            if (knowledgeChapterIndex == chapterPriority.length) {
                return 'finished';
            } else {
                const newKnowledgeChapter = chapterPriority[knowledgeChapterIndex];
                // Return section index to the start
                const newKnowledgeSection = sectionPriority[newKnowledgeChapter][0];

                return userRef.update({ knowledgeChapter: newKnowledgeChapter, knowledgeSection: newKnowledgeSection })
                    .then(() => {
                        return Promise.resolve('complete');
                    })
                    .catch(err => {
                        console.log(err);
                    });
            }
        }
        // Update user's current knowledge section with the next one
        else {
            const newKnowledgeSection = sectionPriority[knowledgeChapter][knowledgeSectionIndex];
            return userRef.update({ knowledgeSection: newKnowledgeSection })
                .then(() => {
                    return Promise.resolve('complete');
                })
                .catch(err => {
                    console.log(err);
                });
        }
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


    agent.handleRequest(intentMap);
});

exports.knowledgeUpload = functions.https.onRequest(async (request, response) => {
    const knowledge = request.body;
    // Add or Update JAVA knowledge in the dataase
    await firestore.collection(knowledge.level).doc(knowledge.name).set(knowledge.content)
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