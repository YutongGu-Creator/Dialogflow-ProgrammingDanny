'use strict';

const axios = require('axios');
const knowledgeData = require('./data.json');

// for (let i in knowledgeData) {
//     console.log(knowledgeData[i]);
// }

for (let i in knowledgeData) {
    // send a POST request
    axios({
        method: 'post',
        url: '',
        data: {
            level: knowledgeData[i].level,
            name: knowledgeData[i].name,
            content: knowledgeData[i].content
        }
    })
        .then(() => { console.log(`${knowledgeData[i].level}'s ${knowledgeData[i].name} is updated successful`) })
        .catch((err => { console.log(err) }));
}

/*
    {
        "level": "",
        "name": "",
        "content": {
            "description": [
                ""
            ]
        }
    }
*/