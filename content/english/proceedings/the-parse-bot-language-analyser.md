---
title: "The Parse Bot Language Analyser"
date: "2019-10-13"
start_time: "7:55 AM"
end_time: ""
publicity: ""
location: "6-Travis"
author: "Jon D Riding"
author_id: "#N/A"
year: "2019"
track: []
slides_url: ""
paper_url: "https://drive.google.com/open?id=0B7RR6AskRWy-T2VFWHdxcThqQjFYS3RmRlhGODZkSXpkQWI4"
video_url: ""
is_plenary: false
lecture: ""
plenary_weight: 0
presenter_ids: ["#N/A"]
author_ids: ["#N/A"]
---

Attempts to build machine translation (MT) systems often founder when faced with low-resource languages. Neural and Statistical MT solutions require vast resources of example/training data or extensive knowledge/rule bases. Only a small proportion of bible translation projects have access to a coherent linguistic dataset. The UBS Glossing Technologies team are developing a language analyser designed to overcome some of these fundamental limitations. The objective of the work is to provide linguistic analysis for current and future computer assisted translation systems to enable them to contribute to a project at a much earlier stage.   
The Parse Bot (PB) system uses a collection of automatic parsers, each focussed on a particular aspect of language. This multi-dimensional approach to learning is proving to be a strong solution. Outputs from the parsers (bots) are aggregated and stored. PB is designed to learn from very small amounts of text. By examining short pericopes in turn the system learns about a target language. Typical outcomes include a bi-lingual dictionary and morphology tables. The system has no prerequisites other than a developing text. This paper will present the system in detail, each parser is discussed and the overall strengths and weaknesses of the approach are assessed. Results from example parses are explained and possible field implementations of the process suggested.