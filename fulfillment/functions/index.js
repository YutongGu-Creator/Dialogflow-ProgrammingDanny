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

    //get PSID from request
    const PSID = agent.originalRequest.payload.data.sender.id;
    // https://developers.facebook.com/docs/messenger-platform/identity/user-profile/#fields;
    const url = `https://graph.facebook.com/${PSID}?fields=id,first_name,last_name&access_token=${PAGE_ACCESS_TOKEN}`;

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
        agent.add('This is what the questions look like, you can select \'a\' if you\'d still like to start new, select other options to continue to answering quizzes.');
        agent.add('a. I want to start new');
        agent.add('b. Continue to answering quizzes.');
        agent.add('c. Continue to answering quizzes.');
        agent.add('d. Continue to answering quizzes.');
        const quizPayload = {
            text: 'Choose an answer',
            quick_replies: [
                {
                    content_type: 'text',
                    title: 'a',
                    payload: 'start new'
                }, {
                    content_type: 'text',
                    title: 'b',
                    payload: 'Continue'
                }, {
                    content_type: 'text',
                    title: 'c',
                    payload: 'Continue'
                }, {
                    content_type: 'text',
                    title: 'd',
                    payload: 'Continue'
                }
            ]
        };
        agent.add(new Payload(agent.FACEBOOK, quizPayload, { rawPayload: false, sendAsMessage: true }));
    }

    // Used with quizzes for updating user's current knowledgeChapter
    function updateUserChapter(id, knowledgeChapter) {
        const userRef = firestore.collection('user').doc(id);
        const kSection = sectionPriority[knowledgeChapter][0];

        return userRef.update({ knowledgeChapter: knowledgeChapter, knowledgeSection: kSection })
            .then(() => {
                return Promise.resolve('complete');
            })
            .catch(err => {
                console.log(err);
            });
    }

    // Sets user's knowledge level tp the middle and give quiz 1 
    function quiz1Start(agent) {
        return axios.get(url)
            .then(user => {
                const quizIndex = Math.floor(chapterPriority.length / 2);
                const kChapter = chapterPriority[quizIndex];
                updateUserChapter(user.data.id, kChapter);
                const quizRef = firestore.collection('quiz').doc(kChapter);
                return quizRef.get()
                    .then(quiz => {
                        agent.add(quiz.data().quiz1.quiz);
                        agent.add(`a. ${quiz.data().quiz1.a}`);
                        agent.add(`b. ${quiz.data().quiz1.b}`);
                        agent.add(`c. ${quiz.data().quiz1.c}`);
                        agent.add(`d. ${quiz.data().quiz1.d}`);
                        const quizPayload = quizResolve(quiz.data().quiz1.answer);
                        agent.add(new Payload(agent.FACEBOOK, quizPayload, { rawPayload: false, sendAsMessage: true }));
                        return Promise.resolve('complete');
                    })
                    .catch(err => {
                        agent.add('error quiz1Start');
                        console.log(err);
                    });
            })
            .catch((err) => {
                console.log(err);
                agent.add('error quiz1Start');
            });
    }

    // Give quiz 2
    function quiz2(agent) {
        return axios.get(url)
            .then(user => {
                const userRef = firestore.collection('user').doc(user.data.id);
                return userRef.get()
                    .then(usr => {
                        const quizRef = firestore.collection('quiz').doc(usr.data().knowledgeChapter);
                        return quizRef.get()
                            .then(quiz => {
                                agent.add(quiz.data().quiz2.quiz);
                                agent.add(`a. ${quiz.data().quiz2.a}`);
                                agent.add(`b. ${quiz.data().quiz2.b}`);
                                agent.add(`c. ${quiz.data().quiz2.c}`);
                                agent.add(`d. ${quiz.data().quiz2.d}`);
                                const quizPayload = quizResolve(quiz.data().quiz2.answer);
                                agent.add(new Payload(agent.FACEBOOK, quizPayload, { rawPayload: false, sendAsMessage: true }));
                                return Promise.resolve('complete');
                            })
                            .catch(err => {
                                agent.add('error quiz2');
                                console.log(err);
                            });
                    })
            }).catch(err => {
                agent.add('error quiz2');
                console.log(err);
            });
    }

    // Give quiz 3
    function quiz3(agent) {
        return axios.get(url)
            .then(user => {
                const userRef = firestore.collection('user').doc(user.data.id);
                return userRef.get()
                    .then(usr => {
                        const quizRef = firestore.collection('quiz').doc(usr.data().knowledgeChapter);
                        return quizRef.get()
                            .then(quiz => {
                                agent.add(quiz.data().quiz3.quiz);
                                agent.add(`a. ${quiz.data().quiz3.a}`);
                                agent.add(`b. ${quiz.data().quiz3.b}`);
                                agent.add(`c. ${quiz.data().quiz3.c}`);
                                agent.add(`d. ${quiz.data().quiz3.d}`);
                                const quizPayload = quizResolve(quiz.data().quiz3.answer);
                                agent.add(new Payload(agent.FACEBOOK, quizPayload, { rawPayload: false, sendAsMessage: true }));
                                return Promise.resolve('complete');
                            })
                            .catch(err => {
                                agent.add('error quiz3');
                                console.log(err);
                            });
                    })
            }).catch(err => {
                agent.add('error quiz3');
                console.log(err);
            });
    }

    // Updates user's knowledge level and decides whether giving harder quiz 1 or ending the quiz loop 
    function quiz1Continue(agent) {
        return axios.get(url)
            .then(user => {
                const userRef = firestore.collection('user').doc(user.data.id);
                return userRef.get()
                    .then(usr => {
                        const currentChapterPriority = usr.data().knowledgeChapter;
                        const currentChapterPriorityIndex = chapterPriority.indexOf(currentChapterPriority);
                        if (currentChapterPriorityIndex === chapterPriority.length - 1) {
                            agent.add('Congrats, you have answered the most difficult quizzes, I don\'t have anything to teach you right now but come back if you are ever confused about a JAVA concept.');
                        } else {
                            // Pick an integer number from currentChapterPriorityIndex to chapterPriority.length - 1
                            const newChapterPriorityIndex = Math.floor(Math.random() * (chapterPriority.length - (currentChapterPriorityIndex + 1)) + (currentChapterPriorityIndex + 1));
                            const newChapterPriority = chapterPriority[newChapterPriorityIndex];
                            updateUserChapter(user.data.id, newChapterPriority);
                            const quizRef = firestore.collection('quiz').doc(newChapterPriority);
                            return quizRef.get()
                                .then(quiz => {
                                    agent.add(quiz.data().quiz1.quiz);
                                    agent.add(`a. ${quiz.data().quiz1.a}`);
                                    agent.add(`b. ${quiz.data().quiz1.b}`);
                                    agent.add(`c. ${quiz.data().quiz1.c}`);
                                    agent.add(`d. ${quiz.data().quiz1.d}`);
                                    const quizPayload = quizResolve(quiz.data().quiz1.answer);
                                    agent.add(new Payload(agent.FACEBOOK, quizPayload, { rawPayload: false, sendAsMessage: true }));
                                    return Promise.resolve('complete');
                                })
                                .catch(err => {
                                    agent.add('error quiz1Continue');
                                    console.log(err);
                                });
                        }
                    })
                    .catch(err => {
                        console.log(err);
                        agent.add('error quiz1Continue');
                    })
            })
    }

    // Updates user's knowledge level and decides whether giving easier quiz 1 or ending the quiz loop 
    function quizFallback(agent) {
        return axios.get(url)
            .then(user => {
                const userRef = firestore.collection('user').doc(user.data.id);
                return userRef.get()
                    .then(usr => {
                        const currentChapterPriority = usr.data().knowledgeChapter;
                        const currentChapterPriorityIndex = chapterPriority.indexOf(currentChapterPriority);
                        if (currentChapterPriorityIndex === 0) {
                            agent.add('It looks you are an beginner, let\'s start learning from the basics.');
                        } else {
                            // Pick an integer number from 0 to ccurrentChapterPriorityIndex - 1
                            const newChapterPriorityIndex = Math.floor(Math.random() * currentChapterPriorityIndex);
                            const newChapterPriority = chapterPriority[newChapterPriorityIndex];
                            updateUserChapter(user.data.id, newChapterPriority);
                            const quizRef = firestore.collection('quiz').doc(newChapterPriority);
                            return quizRef.get()
                                .then(quiz => {
                                    agent.add(quiz.data().quiz1.quiz);
                                    agent.add(`a. ${quiz.data().quiz1.a}`);
                                    agent.add(`b. ${quiz.data().quiz1.b}`);
                                    agent.add(`c. ${quiz.data().quiz1.c}`);
                                    agent.add(`d. ${quiz.data().quiz1.d}`);
                                    const quizPayload = quizResolve(quiz.data().quiz1.answer);
                                    agent.add(new Payload(agent.FACEBOOK, quizPayload, { rawPayload: false, sendAsMessage: true }));
                                    return Promise.resolve('complete');
                                })
                                .catch(err => {
                                    agent.add('error quiz1Continue');
                                    console.log(err);
                                });
                        }
                    })
                    .catch(err => {
                        console.log(err);
                        agent.add('error quiz1Continue');
                    })
            })
    }

    // Set the quick suggestion button payload 
    function quizResolve(answer) {
        const quizPayload = {
            text: 'Choose an answer',
            quick_replies: [
                {
                    content_type: 'text',
                    title: 'a',
                    payload: 'incorrect'
                }, {
                    content_type: 'text',
                    title: 'b',
                    payload: 'incorrect'
                }, {
                    content_type: 'text',
                    title: 'c',
                    payload: 'incorrect'
                }, {
                    content_type: 'text',
                    title: 'd',
                    payload: 'incorrect'
                }
            ]
        };

        if (answer === 'a') {
            quizPayload.quick_replies[0].payload = 'correct';
        } else if (answer === 'b') {
            quizPayload.quick_replies[1].payload = 'correct';
        } else if (answer === 'c') {
            quizPayload.quick_replies[2].payload = 'correct';
        } else {
            quizPayload.quick_replies[3].payload = 'correct';
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
        // Set new users' knowledge to the starting level
        const kChapter = chapterPriority[0];
        const kSection = sectionPriority[kChapter][0];
        user.knowledgeChapter = kChapter;
        user.knowledgeSection = kSection;


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
    intentMap.set('Start Teaching', startTeaching);
    intentMap.set('Quiz1 Start', quiz1Start);
    intentMap.set('Quiz2', quiz2);
    intentMap.set('Quiz3', quiz3);
    intentMap.set('Quiz1 Continue', quiz1Continue);
    intentMap.set('Quiz Fallback', quizFallback);

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