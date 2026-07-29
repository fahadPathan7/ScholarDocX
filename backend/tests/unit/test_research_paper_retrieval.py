"""SCHOLARDOCX-0192: the reference-retrieval path that could never run.

Reported symptom: "how many papers were cited here" cost 79 credits and came
back with "the highest visible reference number is [48] … an exact total cannot
be confirmed", built from three scattered body paragraphs. The service had code
specifically for reference questions; it was unreachable.
"""

from __future__ import annotations

import pytest

from app.services.research_paper_retrieval import (
    apply_retrieval_budget,
    cited_section_numbers,
    detect_inventory_target,
    inventory_note,
    is_reference_chunk,
    lexical_overlap,
    query_terms,
    reference_budget,
    relevance_label,
    scan_inventory,
    section_terms_for,
    wants_reference_section,
)


# --- Classifying the bibliography ------------------------------------------

BIBLIOGRAPHY_WITH_HEADING = (
    "References [1]E.Moriones,VirusRes.71(1-2)(2000)123-134, https://doi.org/10.1016/S0168. "
    "[2]K.Roy,IEEEAccess11(2023)14983-15001,https://doi.org/10.1109/ACCESS. "
    "[3]M.Aggarwal,Agronomy13(10)(2023)2483,https://doi.org/10.3390/agronomy. "
    "[4]E.M.Soylu,PlantPathol.55(2006)1-8,https://doi.org/10.1111/x."
)
MID_BIBLIOGRAPHY = (
    "[45]X.Y,Phys.Scr.99(9)(2024)095206,https://doi.org/10.1088/1402. "
    "[46]A.B,J.Comput.12(2023)11-20,https://doi.org/10.1000/a. "
    "[47]C.D,Nature 8(2022)3-9,https://doi.org/10.1000/b. "
    "[48]M.Meena,Anovelfractionalized,https://doi.org/10.1000/c."
)


@pytest.mark.parametrize(
    "text",
    [
        BIBLIOGRAPHY_WITH_HEADING,
        MID_BIBLIOGRAPHY,
        "BIBLIOGRAPHY\nSmith, J. (2019). A paper.",
        "Works Cited\nDoe, A. (2018).",
        "[10] A. One, Title, J. 1 (2020) 1.\n[11] B. Two, J. 2 (2021) 2.\n"
        "[12] C. Three, J. 3 (2022) 3.\n[13] D. Four, J. 4 (2023) 4.",
    ],
)
def test_reference_passages_are_recognised(text):
    assert is_reference_chunk(text) is True


# Every one of these was labelled "Reference list" to the user under the old
# "four or more citation markers" rule (SCHOLARDOCX-0194).
@pytest.mark.parametrize(
    "name,text",
    [
        (
            "related-work prose citing densely",
            "Several studies address plant disease detection. Roy et al. [2] proposed a PCA-based "
            "network, while Aggarwal et al. [3] explored federated transfer learning. Earlier work "
            "by Soylu et al. [4] focused on antimicrobial activity, and recent efforts [12] combine "
            "attention with residual backbones, a gap noted in the literature [9].",
        ),
        (
            "results table comparing prior methods",
            "Sanidaetal.[35] Inception-VGGNet 21 99.23 Gonzalez-Huitronetal.[36] NasNetMobile 5 92 "
            "Thispaper XLTLDisNet 4.6 97.24 Kaurial.[37] ResNet50 25 94.10 Zhangetal.[38] DenseNet 8 96",
        ),
        (
            "metrics table",
            "VGG19 Precision 0.89 0.82 0.90 0.88 0.91 0.85 0.84 0.97 0.90 0.96 Recall 0.93 0.77 0.86",
        ),
        (
            "dataset paragraph",
            "The dataset was a subset of PlantVillage from the kaggle repository [34]. It contains "
            "three crop species following prior setups [12] and protocols [18], with augmentation "
            "as in [21] applied to balance the classes.",
        ),
        ("single citation", "We evaluate on the PlantVillage dataset from Kaggle [34]."),
        ("plain prose", "The proposed XLTLDisNet architecture uses three convolutional blocks."),
        ("empty", ""),
    ],
)
def test_body_content_is_not_a_reference_passage(name, text):
    assert is_reference_chunk(text) is False, name


# --- Recognising the question ----------------------------------------------

@pytest.mark.parametrize(
    "query",
    [
        "how many papers were cited here",
        "How many references does this paper have?",
        "list the bibliography",
        "which works are cited in the related work",
    ],
)
def test_reference_questions_are_detected(query):
    assert wants_reference_section(query) is True


def test_ordinary_questions_do_not_pull_the_bibliography():
    assert wants_reference_section("what is the baseline model accuracy") is False


# --- The budget -------------------------------------------------------------

def test_reference_budget_always_leaves_room_for_body_context():
    assert reference_budget(10) == 8
    # Never collapses to zero on a small top_k.
    assert reference_budget(4) == 4
    assert reference_budget(1) == 4


def test_bibliography_survives_the_relevance_trim():
    """The bug that made the answer useless.

    A reference entry is semantically bland, so it scores far below prose
    against a natural-language question. Trimming by score alone discarded the
    passages the retrieval had just gone out of its way to fetch.
    """
    chunks = [
        {"chunk_id": f"r{i}", "chunk_index": 80 + i, "similarity_score": 0.11,
         "retrieval": "reference_section"}
        for i in range(8)
    ] + [
        {"chunk_id": f"c{i}", "chunk_index": i, "similarity_score": 0.62 - i * 0.01}
        for i in range(20)
    ]
    selected = apply_retrieval_budget(chunks, top_k=10)
    references = [item for item in selected if item.get("retrieval") == "reference_section"]
    assert len(references) == 8, "every reserved bibliography passage must survive"
    assert len(selected) == 10
    # Body context still present, and the strongest body passage was kept.
    assert any(item["chunk_id"] == "c0" for item in selected)


def test_passages_reach_the_model_in_reading_order():
    chunks = [
        {"chunk_id": "b", "chunk_index": 9, "similarity_score": 0.9},
        {"chunk_id": "a", "chunk_index": 2, "similarity_score": 0.4},
    ]
    assert [item["chunk_id"] for item in apply_retrieval_budget(chunks, top_k=10)] == ["a", "b"]


def test_ordinary_questions_still_trim_purely_by_relevance():
    chunks = [
        {"chunk_id": f"c{i}", "chunk_index": i, "similarity_score": i / 100}
        for i in range(20)
    ]
    selected = apply_retrieval_budget(chunks, top_k=5)
    assert len(selected) == 5
    # The five highest scores are 0.19 … 0.15, i.e. chunk_index 15–19.
    assert [item["chunk_index"] for item in selected] == [15, 16, 17, 18, 19]


# --- Section boosting unchanged --------------------------------------------

def test_section_terms_map_a_question_to_its_section():
    assert "limitation" in section_terms_for("what are the limitations")
    assert "methodology" in section_terms_for("describe the experimental setup")
    assert section_terms_for("how many papers were cited here") == []


# --- Whole-document questions ----------------------------------------------

@pytest.mark.parametrize(
    "query,target",
    [
        ("how many figures are in this paper? can you find?", "figure"),
        ("how many papers were cited here", "reference"),
        ("list all the tables", "table"),
        ("what is the total number of equations", "equation"),
    ],
)
def test_aggregate_questions_are_routed_to_a_document_scan(query, target):
    assert detect_inventory_target(query) == target


@pytest.mark.parametrize(
    "query",
    [
        # About one passage, not the document — ordinary retrieval is right.
        "what does figure 3 show?",
        "explain the table of hyperparameters",
        "what is the baseline model accuracy",
    ],
)
def test_passage_questions_are_left_to_semantic_retrieval(query):
    assert detect_inventory_target(query) is None


PAPER = [
    (21, "Fig. 1 shows the proposed methodology diagram followed in the study."),
    (25, "Fig. 2 depicts tomato leaf disease categories (2a-2j)."),
    (30, "As illustrated in Fig. 3 and Fig. 4, the architecture uses residual blocks."),
    (33, "Figure 5 presents the confusion matrix. Fig. 6 shows training accuracy."),
    (41, "Fig. 6 (a) AlexNet (b) XceptionNet. Fig. 7 GRAD-CAM. Fig. 8a proposed model."),
    (55, "Fig. 9 AUC-ROC curves. Published in 2019. Figure 2024 typo."),
    (79, "Acknowledgement The authors thank the AMIR Lab."),
]


def test_the_whole_document_is_counted_not_a_sample():
    inventory = scan_inventory(PAPER, "figure")
    assert inventory["numbers"] == [1, 2, 3, 4, 5, 6, 7, 8, 9]
    assert inventory["count"] == 9


def test_a_year_is_not_mistaken_for_a_figure_number():
    """`{1,3}` alone matched the first three digits of "Figure 2024" -> 202."""
    assert 202 not in scan_inventory(PAPER, "figure")["numbers"]
    assert 2024 not in scan_inventory(PAPER, "figure")["numbers"]


def test_subfigures_do_not_inflate_the_count():
    """Fig. 8a and Fig. 8b are one figure."""
    inventory = scan_inventory([(1, "Fig. 8a left, Fig. 8b right")], "figure")
    assert inventory["numbers"] == [8]


def test_evidence_passages_are_ordered_by_how_much_they_carry():
    inventory = scan_inventory(PAPER, "figure")
    # Passage 41 mentions three distinct figures; it should lead.
    assert inventory["evidence_ids"][0] == 41
    assert 79 not in inventory["evidence_ids"]


def test_the_note_tells_the_model_to_answer_instead_of_hedging():
    note = inventory_note(scan_inventory(PAPER, "figure"))
    assert "9 distinct figures" in note
    assert "EVERY passage" in note
    assert "do NOT claim the sections are partial" in note


def test_a_sparse_series_does_not_report_nonsense_gaps():
    """With an outlier, "numbers 10-29 never appear" is noise, not a finding."""
    note = inventory_note(scan_inventory([(1, "Fig. 1 and Fig. 40")], "figure"))
    assert "never appear" not in note


def test_nothing_found_is_said_plainly():
    note = inventory_note(scan_inventory([(1, "no numbering at all")], "table"))
    assert "no numbered tables were found" in note


# --- Honest relevance -------------------------------------------------------

def test_stopwords_do_not_become_search_terms():
    assert query_terms("how many papers were cited here") == {"papers", "cited"}


def test_literal_overlap_separates_what_cosine_cannot():
    terms = query_terms("how many papers were cited here")
    bibliography = lexical_overlap("[31] A paper cited by many others", terms)
    acknowledgement = lexical_overlap("The authors thank the AMIR Lab.", terms)
    assert bibliography > acknowledgement


def test_relevance_is_reported_as_standing_not_as_a_percentage():
    # 0.56 and 0.57 were shown as "Relevance: 56%" and "57%" — near the floor
    # of this set, not "moderately relevant".
    assert relevance_label(0.90, 0.90, 0.55) == "Top match"
    assert relevance_label(0.57, 0.90, 0.55) == "Weak match"
    assert relevance_label(0.75, 0.90, 0.55) == "Close match"


def test_a_single_result_is_not_labelled_weak():
    assert relevance_label(0.6, 0.6, 0.6) == "Top match"


# --- Which passages the answer actually used --------------------------------

def test_section_citations_are_read_out_of_the_answer():
    answer = (
        "According to the document-wide scan, 48 distinct cited works are referenced, "
        "numbered [1] through [48] [Section #91]. These span fractional-order systems "
        "[Section #75] and agricultural datasets such as PlantVillage [Section #80]."
    )
    assert cited_section_numbers(answer) == {75, 80, 91}


def test_citation_markers_are_not_mistaken_for_section_tags():
    """"[48]" is a work the paper cites; "[Section #48]" is a passage we showed."""
    assert cited_section_numbers("The paper cites [1] through [48].") == set()


def test_spacing_variants_are_tolerated():
    assert cited_section_numbers("[Section #9] [Section  # 12] [section #3]") == {3, 9, 12}


def test_an_answer_citing_nothing_yields_nothing():
    assert cited_section_numbers("A plain summary with no section tags.") == set()
    assert cited_section_numbers("") == set()


def test_the_bibliography_is_never_labelled_a_weak_match():
    chunks = [
        {"chunk_id": "r1", "chunk_index": 80, "similarity_score": 0.11,
         "chunk_text": "[1] A [2] B", "retrieval": "reference_section"},
        {"chunk_id": "c1", "chunk_index": 3, "similarity_score": 0.62,
         "chunk_text": "body prose"},
    ]
    selected = apply_retrieval_budget(chunks, top_k=10, query="how many papers were cited")
    labels = {item["chunk_id"]: item["relevance_label"] for item in selected}
    assert labels["r1"] == "Reference list"
