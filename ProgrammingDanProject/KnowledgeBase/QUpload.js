'use strict';

const axios = require('axios');
const quiz = require('./quiz.json');

for (let i in quiz) {

    // send a POST request
    axios({
        method: 'post',
        url: '',
        data: {
            name: quiz[i].name,
            content: quiz[i].content
        }
    })
        .then(() => { console.log(`${quiz[i].name} is updated successful`) })
        .catch((err => { console.log(err) }));
}



/*
    {
        "name": "",
        "content": {
            "quiz1": {
                "quiz": "",
                "a": "",
                "b": "",
                "c": "",
                "d": "Not sure",
                "answer": ""
            },
            "quiz2": {
                "quiz": "",
                "a": "",
                "b": "",
                "c": "",
                "d": "Not sure",
                "answer": ""
            },
            "quiz3": {
                "quiz": "",
                "a": "",
                "b": "",
                "c": "",
                "d": "Not sure",
                "answer": ""
            }
        }
    }
*/