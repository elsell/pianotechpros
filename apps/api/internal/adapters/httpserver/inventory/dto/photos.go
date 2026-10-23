package dto

type Photo struct {
	ID      string `json:"id"`
	AltText string `json:"altText"`
}
type PhotoState struct {
	Record Item    `json:"record"`
	Photos []Photo `json:"photos" nullable:"false"`
}
type PhotoOrder struct {
	ExpectedRevision int64    `json:"expectedRevision" minimum:"1" maximum:"9007199254740991"`
	IDs              []string `json:"ids" maxItems:"50" uniqueItems:"true"`
}
type PhotoDescription struct {
	ExpectedRevision int64  `json:"expectedRevision" minimum:"1" maximum:"9007199254740991"`
	AltText          string `json:"altText" maxLength:"240"`
}
